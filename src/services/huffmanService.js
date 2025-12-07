class Node {
    constructor(char, freq, left = null, right = null) {
        this.char = char;
        this.freq = freq;
        this.left = left;
        this.right = right;
    }
}

// دالة مساعدة لترتيب النودز
function sortNodes(nodes) {
    return nodes.sort((a, b) => a.freq - b.freq);
}

// 1. تحليل الاحتمالات (Part 1 Logic)
exports.analyzeProbabilities = (text) => {
    const freqMap = {};
    for (let char of text) {
        freqMap[char] = (freqMap[char] || 0) + 1;
    }

    const totalChars = text.length;
    let outputString = "Symbol Analysis (Part 1):\n-------------------------\n";

    // تنسيق الناتج للملف (Symbol - Probability)
    for (let char in freqMap) {
        const prob = (freqMap[char] / totalChars).toFixed(4);
        // التعامل مع المسافة والسطر الجديد عشان يبانوا في الملف
        let displayChar = char;
        if (char === " ") displayChar = "Space";
        if (char === "\n") displayChar = "NewLine";
        if (char === "\r") displayChar = "Return";

        outputString += `${displayChar} - ${prob}\n`;
    }

    return { frequencyMap: freqMap, formattedOutput: outputString };
};

// 2. بناء الشجرة وتوليد الأكواد (Part 2 Core)
exports.buildHuffmanTree = (freqMap) => {
    let nodes = [];
    for (let char in freqMap) {
        nodes.push(new Node(char, freqMap[char]));
    }

    while (nodes.length > 1) {
        sortNodes(nodes);
        const left = nodes.shift();
        const right = nodes.shift();
        const newNode = new Node(null, left.freq + right.freq, left, right);
        nodes.push(newNode);
    }
    return nodes[0]; // Root node
};

function generateCodes(node, currentCode, codesMap) {
    if (!node) return;
    if (!node.left && !node.right) {
        codesMap[node.char] = currentCode;
        return;
    }
    generateCodes(node.left, currentCode + "0", codesMap);
    generateCodes(node.right, currentCode + "1", codesMap);
}

// دالة التشفير
exports.encode = (text, freqMap) => {
    const root = exports.buildHuffmanTree(freqMap);
    const codesMap = {};
    generateCodes(root, "", codesMap);

    let encodedBinary = "";
    for (let char of text) {
        encodedBinary += codesMap[char];
    }

    return { encodedBinary, huffmanTree: root, codesMap };
};

// 3. دالة فك التشفير (Part 3 & Final)
exports.decode = (binaryString, rootNode) => {
    let decodedText = "";
    let currentNode = rootNode;

    for (let bit of binaryString) {
        if (bit === "0") {
            currentNode = currentNode.left;
        } else {
            currentNode = currentNode.right;
        }

        if (!currentNode.left && !currentNode.right) {
            decodedText += currentNode.char;
            currentNode = rootNode; // Reset to root for next char
        }
    }
    return decodedText;
};
