/**
 * @fileoverview Huffman Coding Service — Source Coding (Compression/Decompression)
 *
 * Implements the Huffman algorithm for lossless data compression:
 * - Analyzes symbol frequency distribution in input text
 * - Builds an optimal binary prefix tree (Huffman tree)
 * - Encodes text into variable-length binary codewords
 * - Decodes binary back to original text using tree traversal
 *
 * This is the source coding layer of the BitShield communication pipeline.
 * It operates independently of the channel coding (Hamming/CRC) layer.
 *
 * @module services/huffmanService
 * @see {@link https://en.wikipedia.org/wiki/Huffman_coding}
 */

/**
 * Represents a node in the Huffman binary tree.
 * Leaf nodes hold a character and its frequency.
 * Internal nodes hold the sum of child frequencies.
 *
 * @class Node
 * @property {string|null} char - The character stored (null for internal nodes)
 * @property {number} freq - Frequency count of the character or sum of children
 * @property {Node|null} left - Left child node (represents bit '0')
 * @property {Node|null} right - Right child node (represents bit '1')
 */
class Node {
    /**
     * Create a Huffman tree node.
     * @param {string|null} char - Character for leaf nodes, null for internal
     * @param {number} freq - Frequency or combined frequency
     * @param {Node|null} [left=null] - Left child
     * @param {Node|null} [right=null] - Right child
     */
    constructor(char, freq, left = null, right = null) {
        this.char = char;
        this.freq = freq;
        this.left = left;
        this.right = right;
    }
}

/**
 * Sort an array of Huffman nodes by frequency in ascending order.
 * Used during tree construction to always merge the two lowest-frequency nodes.
 *
 * @param {Node[]} nodes - Array of Huffman tree nodes
 * @returns {Node[]} The same array, sorted in-place by ascending frequency
 */
function sortNodes(nodes) {
    return nodes.sort((a, b) => a.freq - b.freq);
}

/**
 * Analyze the probability distribution of characters in the input text.
 * Computes frequency counts and formats them for file output.
 *
 * @param {string} text - The raw input text to analyze
 * @returns {{frequencyMap: Object.<string, number>, formattedOutput: string}}
 *   - frequencyMap: Object mapping each character to its count
 *   - formattedOutput: Human-readable string with symbol probabilities
 *
 * @example
 * const result = analyzeProbabilities("hello");
 * // result.frequencyMap = { h: 1, e: 1, l: 2, o: 1 }
 */
exports.analyzeProbabilities = (text) => {
    /** @type {Object.<string, number>} Character frequency counts */
    const freqMap = {};
    for (let char of text) {
        freqMap[char] = (freqMap[char] || 0) + 1;
    }

    const totalChars = text.length;
    let outputString = "Symbol Analysis (Part 1):\n-------------------------\n";

    // Format each symbol with its probability for the output file
    for (let char in freqMap) {
        const prob = (freqMap[char] / totalChars).toFixed(4);
        // Display special characters with readable names
        let displayChar = char;
        if (char === " ") displayChar = "Space";
        if (char === "\n") displayChar = "NewLine";
        if (char === "\r") displayChar = "Return";

        outputString += `${displayChar} - ${prob}\n`;
    }

    return { frequencyMap: freqMap, formattedOutput: outputString };
};

/**
 * Build a Huffman tree from a frequency map using the greedy algorithm.
 * Repeatedly merges the two lowest-frequency nodes until one root remains.
 *
 * @param {Object.<string, number>} freqMap - Character frequency counts
 * @returns {Node} Root node of the constructed Huffman tree
 *
 * @example
 * const tree = buildHuffmanTree({ a: 5, b: 3, c: 1 });
 */
exports.buildHuffmanTree = (freqMap) => {
    /** @type {Node[]} Priority queue of nodes (sorted by frequency) */
    let nodes = [];
    for (let char in freqMap) {
        nodes.push(new Node(char, freqMap[char]));
    }

    // Greedy merge: always combine the two least frequent nodes
    while (nodes.length > 1) {
        sortNodes(nodes);
        const left = nodes.shift(); // lowest frequency
        const right = nodes.shift(); // second lowest frequency
        const newNode = new Node(null, left.freq + right.freq, left, right);
        nodes.push(newNode);
    }
    return nodes[0]; // Root node of the completed tree
};

/**
 * Recursively generate binary codewords by traversing the Huffman tree.
 * Left branches add '0', right branches add '1'.
 * Codewords are stored when a leaf node is reached.
 *
 * @param {Node} node - Current node in the tree traversal
 * @param {string} currentCode - Binary code accumulated so far
 * @param {Object.<string, string>} codesMap - Output map of char -> binary code
 */
function generateCodes(node, currentCode, codesMap) {
    if (!node) return;
    // Leaf node — store the accumulated code for this character
    if (!node.left && !node.right) {
        codesMap[node.char] = currentCode;
        return;
    }
    generateCodes(node.left, currentCode + "0", codesMap);
    generateCodes(node.right, currentCode + "1", codesMap);
}

/**
 * Encode text into a binary string using Huffman coding.
 * Builds the tree, generates codewords, and concatenates them.
 *
 * @param {string} text - The raw text to encode
 * @param {Object.<string, number>} freqMap - Character frequency map
 * @returns {{encodedBinary: string, huffmanTree: Node, codesMap: Object.<string, string>}}
 *   - encodedBinary: The compressed binary string
 *   - huffmanTree: Root of the Huffman tree (needed for decoding)
 *   - codesMap: Mapping of characters to their binary codewords
 *
 * @example
 * const {encodedBinary} = encode("hello", freqMap);
 * // encodedBinary = "110100101" (example, actual depends on tree)
 */
exports.encode = (text, freqMap) => {
    const root = exports.buildHuffmanTree(freqMap);
    /** @type {Object.<string, string>} Character to binary code mapping */
    const codesMap = {};
    generateCodes(root, "", codesMap);

    /** @type {string} Concatenated binary codewords */
    let encodedBinary = "";
    for (let char of text) {
        encodedBinary += codesMap[char];
    }

    return { encodedBinary, huffmanTree: root, codesMap };
};

/**
 * Decode a binary string back to text using the Huffman tree.
 * Traverses the tree bit-by-bit: '0' goes left, '1' goes right.
 * When a leaf is reached, the character is emitted and traversal resets to root.
 *
 * @param {string} binaryString - The binary string to decode
 * @param {Node} rootNode - Root of the Huffman tree used for encoding
 * @returns {string} The decoded (decompressed) text
 * @throws {TypeError} If rootNode is null or the binary string contains invalid sequences
 *
 * @example
 * const text = decode("110100101", huffmanTree);
 * // text = "hello"
 */
exports.decode = (binaryString, rootNode) => {
    let decodedText = "";
    let currentNode = rootNode;

    for (let bit of binaryString) {
        // Traverse: '0' = left branch, '1' = right branch
        if (bit === "0") {
            currentNode = currentNode.left;
        } else {
            currentNode = currentNode.right;
        }

        // Leaf node reached — emit the character and reset
        if (!currentNode.left && !currentNode.right) {
            decodedText += currentNode.char;
            currentNode = rootNode;
        }
    }
    return decodedText;
};
