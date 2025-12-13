// Hamming (7,4) Logic
// Data: d1 d2 d3 d4
// Parity: p1 p2 p3
// Encoded Block: d1 d2 d3 d4 p1 p2 p3 (Standard Data+Parity append)

function calculateParity(d1, d2, d3, d4) {
    // Even Parity
    // p1 covers d1, d2, d4
    const p1 = parseInt(d1) ^ parseInt(d2) ^ parseInt(d4);
    // p2 covers d1, d3, d4
    const p2 = parseInt(d1) ^ parseInt(d3) ^ parseInt(d4);
    // p3 covers d2, d3, d4
    const p3 = parseInt(d2) ^ parseInt(d3) ^ parseInt(d4);
    return { p1, p2, p3 };
}

exports.encode = (binaryString) => {
    let encodedData = "";
    // Padding to make length multiple of 4
    let paddedBinary = binaryString;
    const remainder = binaryString.length % 4;
    if (remainder !== 0) {
        const paddingNeeded = 4 - remainder;
        paddedBinary += "0".repeat(paddingNeeded);
    }

    // Loop every 4 bits
    for (let i = 0; i < paddedBinary.length; i += 4) {
        const d1 = paddedBinary[i];
        const d2 = paddedBinary[i + 1];
        const d3 = paddedBinary[i + 2];
        const d4 = paddedBinary[i + 3];

        const { p1, p2, p3 } = calculateParity(d1, d2, d3, d4);

        // Block 7 bits: d1 d2 d3 d4 p1 p2 p3
        encodedData += `${d1}${d2}${d3}${d4}${p1}${p2}${p3}`;
    }

    return encodedData;
};

exports.decode = (noisyBinaryString) => {
    let correctedBinary = "";
    let totalErrorsCorrected = 0;
    let uncorrectedBlocks = 0; // For cases with more than one error (Theoretically in (7,4) it's hard to detect with accuracy but we'll leave the corrections)

    // Loop every 7 bits
    for (let i = 0; i < noisyBinaryString.length; i += 7) {
        // Reading the block
        let d1 = parseInt(noisyBinaryString[i]);
        let d2 = parseInt(noisyBinaryString[i + 1]);
        let d3 = parseInt(noisyBinaryString[i + 2]);
        let d4 = parseInt(noisyBinaryString[i + 3]);
        let p1 = parseInt(noisyBinaryString[i + 4]);
        let p2 = parseInt(noisyBinaryString[i + 5]);
        let p3 = parseInt(noisyBinaryString[i + 6]);

        // Recalculate Parity (Syndrome Calculation)
        const calcP1 = d1 ^ d2 ^ d4;
        const calcP2 = d1 ^ d3 ^ d4;
        const calcP3 = d2 ^ d3 ^ d4;

        // Syndrome
        const s1 = p1 ^ calcP1; // Difference in p1
        const s2 = p2 ^ calcP2; // Difference in p2
        const s3 = p3 ^ calcP3; // Difference in p3

        // If all Syndromes are 0, no error
        if (s1 === 0 && s2 === 0 && s3 === 0) {
            correctedBinary += `${d1}${d2}${d3}${d4}`;
        } else {
            // Error found, identify and correct
            // Mapping syndrome (s1,s2,s3) binary to error position logic
            // for simplicity we'll just check which equation it affected

            let errorFound = true;

            // Logic to identify which bit is flipped based on s1,s2,s3
            // d1 affected p1 & p2 -> s1=1, s2=1, s3=0
            if (s1 && s2 && !s3) d1 ^= 1;
            // d2 affected p1 & p3 -> s1=1, s2=0, s3=1
            else if (s1 && !s2 && s3) d2 ^= 1;
            // d3 affected p2 & p3 -> s1=0, s2=1, s3=1
            else if (!s1 && s2 && s3) d3 ^= 1;
            // d4 affected all -> s1=1, s2=1, s3=1
            else if (s1 && s2 && s3) d4 ^= 1;
            // Errors in parity bits themselves (we don't care about data, but count it)
            else if (s1 || s2 || s3) {
                // Error is in parity bits, data is safe.
            } else {
                errorFound = false;
            }

            if (errorFound) totalErrorsCorrected++;

            correctedBinary += `${d1}${d2}${d3}${d4}`;
        }
    }

    // Return the corrected binary and correction report
    return {
        correctedBinary,
        correctionReport: {
            correctedErrors: totalErrorsCorrected,
            efficiency: "Calculated based on total noise",
        },
    };
};
