# 🛡️ BitShield — Combined Error Detection & Correction with Incremental Redundancy

> A professional, research-grade **HARQ (Hybrid Automatic Repeat Request)** communication system simulation, built as a senior engineering graduation project.

**University:** Beni-Suef University — Faculty of Engineering — Comm. & Electronics Dept.  
**Supervisor:** Dr. Mohamed Faysel  
**Academic Reference:** Chapter 17 — _Error-Correction Coding and Decoding_ (Tomlinson, Tjhai, Ambroze, Ahmed, Jibril)

---

## 📑 Table of Contents

1. [Project Overview](#-project-overview)
2. [Theoretical Background](#-theoretical-background)
3. [System Architecture](#-system-architecture)
4. [Technology Stack](#-technology-stack)
5. [Project Structure](#-project-structure)
6. [Installation & Usage](#-installation--usage)
7. [API Reference](#-api-reference)
8. [Module Documentation](#-module-documentation)
9. [Performance Metrics](#-performance-metrics)
10. [Team](#-team)

---

## 📌 Project Overview

BitShield simulates a complete digital communication pipeline that demonstrates the power of **combining error detection (CRC-16) with error correction (Extended Hamming 8,4)** using an **Incremental Redundancy (IR)** feedback loop.

### What the System Does

1. **Accepts** a plain text file from the user.
2. **Compresses** the text using Huffman coding (source coding).
3. **Protects** the compressed data with CRC-16-CCITT (error detection).
4. **Encodes** the protected data with Extended Hamming(8,4) (error correction).
5. **Transmits** through a simulated Binary Symmetric Channel (BSC) with configurable noise.
6. **Decodes** at the receiver with syndrome-based correction.
7. **Verifies** integrity via CRC check and a reliability threshold.
8. **Retransmits** incrementally if verification fails (IR stages), sending only additional parity bits rather than the entire frame.
9. **Recovers** the original text and reports detailed performance metrics.

### Three Operating Modes

| Mode                     | Description                                        |
| ------------------------ | -------------------------------------------------- |
| **Classic Mode**         | Legacy Huffman + Hamming(7,4) single-pass pipeline |
| **HARQ Simulation**      | Full IR loop with per-stage visualization          |
| **Performance Analysis** | Monte Carlo simulation with Chart.js plots         |

---

## 📘 Theoretical Background

### 1. Source Coding — Huffman Coding

Huffman coding is an optimal prefix-free variable-length source coding algorithm. It assigns shorter binary codes to more frequent symbols, achieving compression close to the entropy limit.

- **Input:** Character frequency distribution from the text file.
- **Process:** Build a binary tree bottom-up by repeatedly merging the two lowest-frequency nodes.
- **Output:** Variable-length binary codewords for each symbol.
- **Key Property:** No codeword is a prefix of another → unambiguous decoding.

**Compression Ratio** = `1 - (compressed bits / original bits) × 100%`

> ⚠️ **Critical Risk:** Variable-length codes have no synchronization boundaries. A single undetected bit error causes the decoder to lose alignment, corrupting the entire output from that point onward. This is the primary motivation for strong error protection.

---

### 2. Error Detection — CRC-16-CCITT

Cyclic Redundancy Check (CRC) provides error **detection** (not correction). We use the CRC-16-CCITT standard.

- **Polynomial:** `x¹⁶ + x¹² + x⁵ + 1` (hex: `0x1021`)
- **Process:** Treat binary data as a polynomial, divide by the generator polynomial using XOR arithmetic, and append the 16-bit remainder.
- **Detection Power:** Detects all single-bit errors, all double-bit errors, all odd-number-of-bit errors, and any burst error ≤ 16 bits.

**Placement in Pipeline:**  
CRC is computed on the **Huffman-compressed payload** (before Hamming encoding). At the receiver, Hamming decoding is applied first, then CRC is checked on the decoded payload. This ensures CRC detects errors that Hamming failed to correct (e.g., 3+ bit errors that cause silent miscorrection).

```
CRC Position:  [Huffman Output] → [+ CRC-16] → [Hamming Encode] → Channel
```

---

### 3. Error Correction — Extended Hamming(8,4)

The Extended Hamming(8,4) code is an upgrade from the standard Hamming(7,4). It adds an overall parity bit for enhanced error behavior.

| Component      | Bits           | Purpose                                   |
| -------------- | -------------- | ----------------------------------------- |
| Data           | d1, d2, d3, d4 | 4 information bits                        |
| Hamming parity | p1, p2, p3     | 3 parity bits for single-error correction |
| Overall parity | p4             | 1 extra bit for double-error detection    |
| **Total**      | **8 bits**     | Rate = 4/8 = 0.5                          |

**Parity equations:**

```
p1 = d1 ⊕ d2 ⊕ d4        (covers positions 1, 2, 4)
p2 = d1 ⊕ d3 ⊕ d4        (covers positions 1, 3, 4)
p3 = d2 ⊕ d3 ⊕ d4        (covers positions 2, 3, 4)
p4 = d1 ⊕ d2 ⊕ d3 ⊕ d4 ⊕ p1 ⊕ p2 ⊕ p3  (overall parity)
```

**Decoding decision matrix:**

| Syndrome (s1,s2,s3) | Overall Parity (p4) | Interpretation | Action             |
| ------------------- | ------------------- | -------------- | ------------------ |
| 000                 | OK (0)              | No error       | None               |
| ≠000                | FAIL (1)            | Single error   | Correct it         |
| ≠000                | OK (0)              | Double error   | Detect only (NACK) |
| 000                 | FAIL (1)            | p4 bit error   | Data is safe       |

**Minimum Distance:** d_min = 4, which guarantees:

- Correction of all 1-bit errors
- Detection of all 2-bit errors

---

### 4. Incremental Redundancy (IR) — Chapter 17

IR is a type of **Type-II Hybrid ARQ** where the transmitter sends additional redundancy only when needed, rather than retransmitting the entire frame.

#### How Our IR System Works

**Stage 1 — Punctured Transmission (Rate 4/6 ≈ 0.67):**

- Send only 6 of 8 bits per block: `d1, d2, d3, d4, p1, p2`
- Withhold `p3, p4` (remaining parity)
- Receiver inserts zeros for missing positions and attempts decode
- If CRC passes AND reliability ≥ threshold → **ACK** (done!)

**Stage 2 — Full Code (Rate 4/8 = 0.50):**

- Send the withheld parity bits: `p3, p4`
- Receiver reconstructs complete 8-bit blocks
- Full Extended Hamming(8,4) decode → CRC check → decision

**Stage 3+ — Retransmission with Majority Combining:**

- Retransmit the entire 8-bit codeword
- Receiver performs **majority-vote combining** across all received copies
- For each bit position, the value that appears most often wins
- Decode the combined result → CRC check → decision

**Maximum stages (M):** Configurable (default 4). After M stages, the system declares failure and outputs the best available decode.

#### Reliability Threshold (κ)

Inspired by Chapter 17's soft-decision metric, we use a reliability score based on the syndrome weight:

```
reliability = (cleanBlocks - 2 × uncorrectableBlocks) / totalBlocks
threshold = 1 - κ × P(block error) × d_min
```

The **dual-check decision logic**:

- CRC must pass (necessary condition)
- Reliability must exceed threshold (sufficiency condition)
- Both must be true for ACK — this prevents accepting CRC-passed frames where too many blocks required correction.

---

### 5. Binary Symmetric Channel (BSC)

The BSC flips each bit independently with probability `p` (the crossover probability / error rate).

```
P(received = 1 | sent = 0) = p
P(received = 0 | sent = 1) = p
P(received = 0 | sent = 0) = 1 - p
P(received = 1 | sent = 1) = 1 - p
```

For fair comparative simulations, a **seedable PRNG** (Mulberry32) ensures all four systems face identical noise patterns.

---

## 🏗️ System Architecture

### End-to-End Pipeline

```
┌──────────────────────── TRANSMITTER ────────────────────────┐
│                                                              │
│  Text File                                                   │
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────────┐                                         │
│  │ Huffman Encoder  │  Source Coding (compression)            │
│  └────────┬────────┘                                         │
│           │ compressed binary                                │
│           ▼                                                  │
│  ┌─────────────────┐                                         │
│  │  CRC-16 Append   │  Error Detection Code                  │
│  └────────┬────────┘                                         │
│           │ data + 16-bit CRC                                │
│           ▼                                                  │
│  ┌─────────────────┐                                         │
│  │ Hamming(8,4)     │  Error Correction Code                  │
│  │ Punctured Encode │  Split into IR stages                   │
│  └────────┬────────┘                                         │
│           │ Stage 1 bits (6/block)                            │
└───────────┼──────────────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │     BSC       │  Binary Symmetric Channel (noise)
     │   p = error   │
     └──────┬───────┘
            │
┌───────────┼──────────────────────────────────────────────────┐
│           ▼                              RECEIVER            │
│  ┌─────────────────┐                                         │
│  │ Hamming(8,4)     │  Syndrome-based decode                  │
│  │ Decode           │  (insert 0s for missing parity)         │
│  └────────┬────────┘                                         │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐                                         │
│  │  CRC-16 Check    │  Verify data integrity                  │
│  └────────┬────────┘                                         │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐                                         │
│  │ Reliability      │  Syndrome-weight confidence metric      │
│  │ Threshold Check  │                                        │
│  └────────┬────────┘                                         │
│           │                                                  │
│      ┌────┴────┐                                             │
│      ▼         ▼                                             │
│    ACK       NACK ──── Request next IR stage ──→ Transmitter │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────┐                                         │
│  │ Huffman Decoder  │  Decompress to original text            │
│  └─────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
```

### Four Comparison Systems

The Performance Analysis tab compares four protection strategies:

| System               | Detection | Correction | Retransmission  | Notes                              |
| -------------------- | --------- | ---------- | --------------- | ---------------------------------- |
| **A: No Protection** | ✗         | ✗          | ✗               | Raw Huffman through BSC            |
| **B: CRC-16 Only**   | ✓         | ✗          | Full retransmit | Pure ARQ — retransmit entire frame |
| **C: Hamming Only**  | ✗         | ✓          | ✗               | FEC only — no feedback             |
| **D: Combined IR**   | ✓         | ✓          | Incremental     | Full HARQ — the Chapter 17 system  |

---

## 🛠️ Technology Stack

| Layer           | Technology           | Purpose                              |
| --------------- | -------------------- | ------------------------------------ |
| **Runtime**     | Node.js              | Server-side JavaScript               |
| **Framework**   | Express.js 5         | HTTP server and routing              |
| **File Upload** | Multer 2             | Multipart form data (memory storage) |
| **CORS**        | cors                 | Cross-origin resource sharing        |
| **Config**      | dotenv               | Environment variable management      |
| **Charts**      | Chart.js (CDN)       | Performance visualization            |
| **Icons**       | Font Awesome 6 (CDN) | UI icons                             |
| **Fonts**       | Inter (Google Fonts) | Typography                           |

> **No additional dependencies** are required beyond the original `package.json`. All new modules are pure JavaScript.

---

## 📂 Project Structure

```
Information_Theory_Project/
│
├── app.js                          # Express server entry point
├── package.json                    # Dependencies and scripts
├── .env                            # Environment variables (PORT)
│
├── public/                         # Static frontend files
│   ├── index.html                  # Main HTML — 3-tab layout
│   ├── styles.css                  # Dark theme design system
│   └── app.js                      # Frontend JavaScript (tabs, forms, charts)
│
├── src/
│   ├── services/                   # Core business logic
│   │   ├── huffmanService.js       # Huffman coding (compress/decompress)
│   │   ├── hammingService.js       # Hamming(7,4) + Extended Hamming(8,4) + IR stages
│   │   ├── noiseService.js         # BSC noise injection (random + seedable)
│   │   ├── crcService.js           # CRC-16-CCITT (compute, append, check)
│   │   ├── reliabilityService.js   # Reliability scoring + ACK/NACK decision
│   │   └── irService.js            # IR controller (single sim, compare, Monte Carlo)
│   │
│   ├── controllers/                # Request handlers
│   │   ├── projectController.js    # Legacy /api/process endpoint
│   │   └── simulationController.js # HARQ simulation endpoints
│   │
│   └── routes/
│       └── api.js                  # Express router definitions
│
├── outputs/                        # Generated output files
├── test/
│   ├── test_Project.txt            # Standard test file (~1.6 KB)
│   └── test_small.txt              # Small test file (~200 bytes, for Monte Carlo)
│
└── Report/
    └── chapter17.pdf               # Academic reference material
```

---

## 🚀 Installation & Usage

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher

### Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd Information_Theory_Project

# 2. Install dependencies
npm install

# 3. Start the development server
npm start
```

The server launches at **http://localhost:3000**.

### Usage

1. **Classic Mode:** Upload a `.txt` file → single-pass Huffman + Hamming(7,4) simulation.
2. **HARQ Simulation:** Upload file → configure error rate, max stages, κ → run IR loop → view per-stage timeline.
3. **Performance Analysis:** Upload file → configure sweep parameters → run Monte Carlo → view BER/FER/Throughput/Retransmission charts.

---

## 📡 API Reference

### `POST /api/process` — Classic Mode

Legacy single-pass pipeline using Hamming(7,4).

| Parameter  | Type | Description                       |
| ---------- | ---- | --------------------------------- |
| `textFile` | File | `.txt` file (multipart/form-data) |

**Response:** Statistics (compression, errors injected/corrected, text accuracy) + download links.

---

### `POST /api/simulate` — HARQ Simulation

Full IR loop with per-stage breakdown.

| Parameter   | Type  | Default | Description                      |
| ----------- | ----- | ------- | -------------------------------- |
| `textFile`  | File  | —       | `.txt` file                      |
| `errorRate` | float | 0.01    | BSC crossover probability        |
| `maxStages` | int   | 4       | Maximum IR stages                |
| `kappa`     | float | 1.0     | Reliability threshold multiplier |

**Response:** `{success, stages[], metrics, compressionStats, finalText, originalText}`

---

### `POST /api/simulate/compare` — Comparative Simulation

Runs all 4 systems on the same data with identical noise (seeded PRNG).

| Parameter   | Type  | Default | Description                      |
| ----------- | ----- | ------- | -------------------------------- |
| `textFile`  | File  | —       | `.txt` file                      |
| `errorRate` | float | 0.01    | BSC crossover probability        |
| `maxStages` | int   | 4       | Maximum IR stages                |
| `kappa`     | float | 1.0     | Reliability threshold multiplier |

**Response:** `{systems: {noProtection, crcOnly, hammingOnly, combinedIR}, compressionStats}`

---

### `POST /api/simulate/montecarlo` — Monte Carlo Sweep

Runs N trials at each noise level for all 4 systems. Returns chart-ready data.

| Parameter        | Type  | Default | Description            |
| ---------------- | ----- | ------- | ---------------------- |
| `textFile`       | File  | —       | `.txt` file            |
| `errorRateMin`   | float | 0.001   | Sweep start            |
| `errorRateMax`   | float | 0.1     | Sweep end              |
| `numPoints`      | int   | 15      | Number of test points  |
| `trialsPerPoint` | int   | 200     | Trials per noise level |
| `maxStages`      | int   | 4       | Maximum IR stages      |
| `kappa`          | float | 1.0     | Threshold multiplier   |

**Response:** `{errorRates[], systems: {noProtection, crcOnly, hammingOnly, combinedIR}}` — each system has `ber[]`, `fer[]`, `throughput[]`.

---

## 📦 Module Documentation

### `huffmanService.js` — Source Coding

| Function                         | Input          | Output                                   | Description                           |
| -------------------------------- | -------------- | ---------------------------------------- | ------------------------------------- |
| `analyzeProbabilities(text)`     | string         | `{frequencyMap, formattedOutput}`        | Compute symbol frequency distribution |
| `buildHuffmanTree(freqMap)`      | object         | Node (tree root)                         | Build optimal prefix tree             |
| `encode(text, freqMap)`          | string, object | `{encodedBinary, huffmanTree, codesMap}` | Compress text to binary               |
| `decode(binaryString, rootNode)` | string, Node   | string                                   | Decompress binary to text             |

### `crcService.js` — Error Detection

| Function                        | Input          | Output                       | Description                   |
| ------------------------------- | -------------- | ---------------------------- | ----------------------------- |
| `computeCRC(binaryString)`      | string         | string (16 bits)             | Compute CRC-16-CCITT checksum |
| `appendCRC(binaryString)`       | string         | `{protected, payloadLength}` | Append CRC to data            |
| `checkCRC(data, payloadLength)` | string, number | `{isValid, payload}`         | Verify CRC integrity          |

### `hammingService.js` — Error Correction

| Function                                    | Input          | Output                                       | Description                            |
| ------------------------------------------- | -------------- | -------------------------------------------- | -------------------------------------- |
| `encode(binaryString)`                      | string         | string                                       | Legacy Hamming(7,4) encode             |
| `decode(noisyBinary)`                       | string         | `{correctedBinary, correctionReport}`        | Legacy Hamming(7,4) decode             |
| `encodeExtended(binaryString)`              | string         | `{encoded, paddingBits}`                     | Extended Hamming(8,4) encode           |
| `decodeExtended(encoded, padding)`          | string, number | `{decoded, report}`                          | Extended decode with 2-error detection |
| `encodePunctured(binaryString)`             | string         | `{stage1Bits, stage2Bits, fullEncoded, ...}` | Split into IR stages                   |
| `decodeFromStages(s1, s2, padding, blocks)` | strings        | `{decoded, report}`                          | Reconstruct from partial stages        |
| `majorityVoteCombine(copies)`               | string[]       | string                                       | Bit-level majority vote combining      |

### `noiseService.js` — Channel Simulation

| Function                                | Input              | Output                     | Description                         |
| --------------------------------------- | ------------------ | -------------------------- | ----------------------------------- |
| `injectNoise(binary, rate)`             | string, float      | `{noisyData, noiseReport}` | Random BSC (legacy)                 |
| `injectNoiseSeeded(binary, rate, seed)` | string, float, int | `{noisyData, noiseReport}` | Deterministic BSC (Mulberry32 PRNG) |

### `reliabilityService.js` — Decision Logic

| Function                                        | Input              | Output               | Description                         |
| ----------------------------------------------- | ------------------ | -------------------- | ----------------------------------- |
| `computeReliability(report)`                    | object             | number [-1,1]        | Syndrome-weight reliability score   |
| `computeThreshold(kappa, errorRate)`            | float, float       | number [0,1]         | Adaptive threshold (Ch.17 Eq.17.13) |
| `makeDecision(crcPass, reliability, threshold)` | bool, float, float | `{decision, reason}` | ACK/NACK decision                   |

### `irService.js` — IR Controller

| Function                                  | Input          | Output                | Description              |
| ----------------------------------------- | -------------- | --------------------- | ------------------------ |
| `createIRSession(text, options)`          | string, object | Full result object    | Run one HARQ simulation  |
| `runComparativeSimulation(text, options)` | string, object | 4-system comparison   | Same noise, 4 strategies |
| `runMonteCarlo(text, options)`            | string, object | Chart.js-ready arrays | Sweep error rates        |

---

## 📊 Performance Metrics

The system tracks and visualizes these metrics:

| Metric                     | Formula                              | Interpretation                         |
| -------------------------- | ------------------------------------ | -------------------------------------- |
| **BER** (Bit Error Rate)   | errors / total bits                  | Fraction of bits decoded incorrectly   |
| **FER** (Frame Error Rate) | failed frames / total frames         | Probability that a frame has any error |
| **Throughput**             | useful bits / total transmitted bits | Efficiency including retransmissions   |
| **Avg Retransmissions**    | Σ retransmissions / N trials         | Average IR stages needed               |

### Expected Behavior

- **At low noise (p < 0.01):** Combined IR ≈ Hamming-only performance; both vastly outperform no protection.
- **At medium noise (p ≈ 0.03-0.05):** Combined IR shows clear advantage — Hamming alone starts miscorrecting, but CRC catches these failures.
- **At high noise (p > 0.08):** All systems degrade; Combined IR shows lower FER but decreased throughput due to retransmissions.
- **CRC-only** has the lowest throughput at all noise levels (retransmits entire frame each time).
- **Combined IR** maintains the best balance of reliability and efficiency.

---

## 👥 Team

| Name                | Role      |
| ------------------- | --------- |
| Ahmed Toba Mahmoud  | Developer |
| Ahmed Shaban Sayed  | Developer |
| Adham Mahmoud Hamed | Developer |
| Mahmoud Saleh Awad  | Developer |
| Mahmoud Ahmed       | Developer |
| Hadeer Naser        | Developer |
| Rana Tamer          | Developer |

**Supervised by:** Dr. Mohamed Faysel

---

## 📄 License

ISC License — © 2025-2026 Information Theory Project
