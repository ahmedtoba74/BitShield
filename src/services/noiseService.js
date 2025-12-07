exports.injectNoise = (binaryString, errorRate = 0.05) => {
    let noisyData = "";
    let totalErrors = 0;

    for (let char of binaryString) {
        // Random check
        if (Math.random() < errorRate) {
            // Flip bit
            noisyData += char === "0" ? "1" : "0";
            totalErrors++;
        } else {
            noisyData += char;
        }
    }

    return {
        noisyData,
        noiseReport: { totalErrors },
    };
};
