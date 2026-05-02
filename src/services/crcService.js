/**
 * @fileoverview CRC-16-CCITT Error Detection Service
 *
 * Implements the CRC-16-CCITT cyclic redundancy check for error detection
 * in the HARQ communication pipeline. Based on Chapter 17, Fig 17.4.
 *
 * CRC is applied BEFORE Hamming encoding (protects the Huffman payload)
 * and verified AFTER Hamming decoding at the receiver.
 *
 * Polynomial: x^16 + x^12 + x^5 + 1 (0x1021)
 * Detection capability:
 *   - All single-bit errors
 *   - All double-bit errors
 *   - All odd-count bit errors
 *   - Any burst error of length <= 16 bits
 *
 * @module services/crcService
 * @see Chapter 17, Fig 17.4 — CRC placement in the HARQ pipeline
 */

/**
 * CRC-16-CCITT generator polynomial: x^16 + x^12 + x^5 + 1
 * @constant {number}
 */
const CRC_POLYNOMIAL = 0x1021;

/**
 * Number of CRC checksum bits (16 for CRC-16)
 * @constant {number}
 */
const CRC_BITS = 16;

/**
 * Compute CRC-16-CCITT checksum for a binary string.
 *
 * Uses a bit-by-bit shift register simulation:
 * 1. Initialize a 16-bit register to 0x0000
 * 2. For each input bit, XOR with MSB of register
 * 3. Shift register left; if XOR result was 1, XOR with polynomial
 * 4. Final register value is the CRC checksum
 *
 * @param {string} binaryString - Input binary string consisting of '0' and '1' characters
 * @returns {string} 16-bit CRC checksum as a binary string (e.g., "0010100110110001")
 *
 * @example
 * const crc = computeCRC("01001000"); // CRC of ASCII 'H'
 */
exports.computeCRC = (binaryString) => {
    /** @type {number} 16-bit shift register, initialized to 0 */
    let register = 0x0000;

    for (let i = 0; i < binaryString.length; i++) {
        /** @type {number} Current input bit (0 or 1) */
        const bit = parseInt(binaryString[i]);

        /** @type {number} Most significant bit of the register before shift */
        const msb = (register >> 15) & 1;

        // Shift register left by 1, mask to 16 bits
        register = (register << 1) & 0xffff;
        register |= 0;

        // If MSB XOR input bit equals 1, apply polynomial division
        if ((msb ^ bit) === 1) {
            register ^= CRC_POLYNOMIAL;
        }
    }

    // Convert the 16-bit register to a zero-padded binary string
    return register.toString(2).padStart(CRC_BITS, "0");
};

/**
 * Append CRC-16 checksum to the end of binary data.
 *
 * Standard CRC computation: augment data with 16 zero bits,
 * compute CRC of augmented data, then append the CRC to original data.
 * This is equivalent to computing data * x^16 mod G(x).
 *
 * @param {string} binaryString - Input binary data to protect
 * @returns {{protected: string, payloadLength: number}}
 *   - protected: Binary string with 16-bit CRC appended (length = input + 16)
 *   - payloadLength: Length of original data (needed to strip CRC after decoding)
 *
 * @example
 * const result = appendCRC("10110100");
 * // result.protected = "10110100" + "0101101001001110" (16-bit CRC)
 * // result.payloadLength = 8
 */
exports.appendCRC = (binaryString) => {
    // Augment data with 16 zeros before computing CRC (standard procedure)
    const augmented = binaryString + "0".repeat(CRC_BITS);
    const crc = exports.computeCRC(augmented);

    return {
        protected: binaryString + crc,
        payloadLength: binaryString.length,
    };
};

/**
 * Verify CRC-16 integrity on received data (payload + appended CRC).
 *
 * Extracts the payload and received CRC, recomputes CRC on the payload,
 * and compares. If they match, the data is considered error-free.
 *
 * @param {string} binaryStringWithCRC - Binary string containing data + 16-bit CRC
 * @param {number} payloadLength - Length of the original data portion (without CRC)
 * @returns {{isValid: boolean, payload: string}}
 *   - isValid: true if CRC verification passes (data integrity confirmed)
 *   - payload: The extracted data portion (without CRC bits)
 *
 * @example
 * const check = checkCRC(receivedData, 256);
 * if (check.isValid) {
 *   // Data is intact — proceed with Huffman decode
 * } else {
 *   // CRC mismatch — request retransmission (NACK)
 * }
 */
exports.checkCRC = (binaryStringWithCRC, payloadLength) => {
    // Guard: data must be at least 16 bits to contain a CRC
    if (binaryStringWithCRC.length < CRC_BITS) {
        return { isValid: false, payload: "" };
    }

    /** @type {string} The data portion (before CRC) */
    const payload = binaryStringWithCRC.substring(0, payloadLength);

    /** @type {string} The received CRC bits (after data) */
    const receivedCRC = binaryStringWithCRC.substring(
        payloadLength,
        payloadLength + CRC_BITS,
    );

    // Recompute CRC on the payload using the same augmentation method
    const augmented = payload + "0".repeat(CRC_BITS);
    const computedCRC = exports.computeCRC(augmented);

    return {
        isValid: computedCRC === receivedCRC,
        payload: payload,
    };
};
