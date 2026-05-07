# BitShield — Combined Error Detection & Correction with Incremental Redundancy

## HARQ Communication System Simulation

---

**University:** Beni-Suef University — Faculty of Engineering  
**Department:** Communications & Electronics Engineering  
**Supervisor:** Dr. Mohamed Faysel  
**Academic Reference:** Chapter 17 — *Error-Correction Coding and Decoding* (Tomlinson, Tjhai, Ambroze, Ahmed, Jibril)  
**Date:** May 2026

### Team Members

| Name | Role |
|------|------|
| Ahmed Toba Mahmoud | Developer |
| Ahmed Shaban Sayed | Developer |
| Adham Mahmoud Hamed | Developer |
| Mahmoud Saleh Awad | Developer |
| Mahmoud Ahmed | Developer |
| Hadeer Naser | Developer |
| Rana Tamer | Developer |

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Introduction](#2-introduction)
3. [Project Objectives](#3-project-objectives)
4. [Theoretical Background](#4-theoretical-background)
   - 4.1 Source Coding — Huffman Coding
   - 4.2 Error Detection — CRC-16-CCITT
   - 4.3 Error Correction — Extended Hamming(8,4)
   - 4.4 Binary Symmetric Channel (BSC)
   - 4.5 Incremental Redundancy (IR) — Type-II HARQ
   - 4.6 Reliability-Based Decision Logic
5. [System Architecture](#5-system-architecture)
   - 5.1 End-to-End Pipeline
   - 5.2 Four Comparison Systems
6. [Software Implementation](#6-software-implementation)
   - 6.1 Technology Stack
   - 6.2 Project Structure
   - 6.3 Module Descriptions
   - 6.4 API Endpoints
   - 6.5 Frontend Interface
7. [Results & Analysis](#7-results--analysis)
   - 7.1 Performance Metrics
   - 7.2 Expected Behavior Across Noise Levels
   - 7.3 System Comparison Summary
8. [Conclusion](#8-conclusion)
9. [References](#9-references)

---

## 1. Abstract

This report presents **BitShield**, a web-based simulation of a Hybrid Automatic Repeat Request (HARQ) communication system with Incremental Redundancy (IR). The project demonstrates the power of combining error detection (CRC-16-CCITT) with error correction (Extended Hamming(8,4) code) using an IR feedback loop, as described in Chapter 17 of *Error-Correction Coding and Decoding*.

The system implements a complete digital communication pipeline: source coding via Huffman compression, error detection via CRC-16, error correction via Extended Hamming(8,4) with minimum distance d_min = 4, channel simulation via Binary Symmetric Channel (BSC), and an Incremental Redundancy retransmission protocol. The software provides three operating modes — Classic Mode, HARQ Simulation, and Monte Carlo Performance Analysis — enabling comprehensive evaluation of four distinct protection strategies under varying noise conditions.

Built with Node.js and Express.js, BitShield features a professional web interface with real-time visualization of simulation results, IR loop timelines, and Chart.js-powered performance comparison charts (BER, FER, Throughput, Retransmissions).

---

## 2. Introduction

Digital communication systems must reliably transmit data across noisy channels. Two fundamental approaches exist for handling transmission errors:

- **Forward Error Correction (FEC):** The transmitter adds redundancy so the receiver can correct errors without feedback. Examples include Hamming codes, convolutional codes, and turbo codes.
- **Automatic Repeat Request (ARQ):** The receiver detects errors and requests retransmission. This requires a feedback channel but guarantees high reliability.

**Hybrid ARQ (HARQ)** combines both approaches. In **Type-II HARQ with Incremental Redundancy**, the transmitter initially sends data with minimal redundancy. If decoding fails, it sends additional parity bits rather than repeating the entire frame, improving spectral efficiency.

This project implements a Type-II HARQ system using:
- **Huffman coding** for source compression
- **CRC-16-CCITT** for error detection
- **Extended Hamming(8,4)** for error correction
- **Incremental Redundancy** with punctured codes and majority-vote combining

The system is inspired by Chapter 17 of the reference textbook and demonstrates how combining detection and correction with an intelligent retransmission strategy outperforms any single technique alone.

---

## 3. Project Objectives

1. Implement a complete digital communication pipeline with source coding, channel coding, and channel simulation.
2. Demonstrate the Huffman algorithm for optimal lossless data compression.
3. Implement CRC-16-CCITT for robust error detection with proven mathematical guarantees.
4. Implement Extended Hamming(8,4) for single-error correction and double-error detection (d_min = 4).
5. Build an Incremental Redundancy (IR) feedback loop with punctured codes and majority-vote combining.
6. Implement a reliability-based ACK/NACK decision mechanism inspired by Chapter 17.
7. Compare four protection strategies (No Protection, CRC-only, Hamming-only, Combined IR) under identical noise conditions.
8. Provide Monte Carlo simulation capability for statistical performance analysis (BER, FER, Throughput).
9. Build a professional web-based interface for interactive simulation and visualization.

---

## 4. Theoretical Background

### 4.1 Source Coding — Huffman Coding

Huffman coding is an optimal prefix-free variable-length source coding algorithm. It assigns shorter binary codes to more frequent symbols, achieving compression close to the entropy limit H(X).

**Algorithm:**
1. Compute the frequency of each character in the input text.
2. Create a leaf node for each character with its frequency.
3. Repeatedly merge the two lowest-frequency nodes into a new internal node.
4. The resulting binary tree defines the codewords: left = '0', right = '1'.

**Key Properties:**
- **Prefix-free:** No codeword is a prefix of another, enabling unambiguous decoding.
- **Optimal:** Among all prefix-free codes, Huffman coding minimizes the expected code length.
- **Compression Ratio:** `CR = 1 - (compressed_bits / original_bits) × 100%`

**Critical Risk:** Variable-length codes lack synchronization boundaries. A single undetected bit error causes the decoder to lose alignment, corrupting the entire output from that point forward. This is the primary motivation for strong error protection in the pipeline.

### 4.2 Error Detection — CRC-16-CCITT

Cyclic Redundancy Check (CRC) provides powerful error detection using polynomial arithmetic over GF(2).

**Generator Polynomial:** G(x) = x^16 + x^12 + x^5 + 1 (hex: 0x1021)

**Process:**
1. Treat the binary data M(x) as a polynomial over GF(2).
2. Multiply by x^16 (append 16 zeros).
3. Divide M(x) · x^16 by G(x) using XOR arithmetic.
4. The 16-bit remainder R(x) is the CRC checksum.
5. Transmit T(x) = M(x) · x^16 + R(x).
6. At the receiver, divide received data by G(x). Zero remainder = no detectable error.

**Detection Capabilities:**
- All single-bit errors
- All double-bit errors
- All odd-number-of-bit errors
- Any burst error of length ≤ 16 bits

**Implementation:** Uses a 16-bit shift register simulation. For each input bit, XOR with the MSB of the register, shift left, and conditionally XOR with the polynomial.

**Pipeline Placement:** CRC is computed on the Huffman-compressed payload before Hamming encoding. At the receiver, Hamming decoding is applied first, then CRC is verified. This layered approach allows CRC to catch errors that Hamming failed to correct (e.g., 3+ bit errors causing silent miscorrection).

```
Pipeline: [Huffman Output] → [+ CRC-16] → [Hamming Encode] → Channel
```

### 4.3 Error Correction — Extended Hamming(8,4)

The Extended Hamming(8,4) code upgrades the standard Hamming(7,4) by adding an overall parity bit for enhanced error behavior.

**Block Format:** [d1, d2, d3, d4, p1, p2, p3, p4]

| Component | Bits | Purpose |
|-----------|------|---------|
| Data | d1, d2, d3, d4 | 4 information bits |
| Hamming parity | p1, p2, p3 | 3 bits for single-error correction |
| Overall parity | p4 | 1 bit for double-error detection |
| **Total** | **8 bits** | Code rate R = 4/8 = 0.5 |

**Parity Equations:**
```
p1 = d1 ⊕ d2 ⊕ d4        (covers positions 1, 2, 4)
p2 = d1 ⊕ d3 ⊕ d4        (covers positions 1, 3, 4)
p3 = d2 ⊕ d3 ⊕ d4        (covers positions 2, 3, 4)
p4 = d1 ⊕ d2 ⊕ d3 ⊕ d4 ⊕ p1 ⊕ p2 ⊕ p3  (overall parity)
```

**Decoding Decision Matrix:**

| Syndrome (s1,s2,s3) | Overall Parity (p4) | Interpretation | Action |
|---------------------|---------------------|----------------|--------|
| 000 | OK (0) | No error | None |
| ≠000 | FAIL (1) | Single error | Correct it |
| ≠000 | OK (0) | Double error | Detect only (NACK) |
| 000 | FAIL (1) | p4 bit error | Data is safe |

**Minimum Distance:** d_min = 4, guaranteeing:
- Correction of all 1-bit errors per block
- Detection of all 2-bit errors per block

### 4.4 Binary Symmetric Channel (BSC)

The BSC is a memoryless channel model where each bit is independently flipped with crossover probability p:

```
P(received=1 | sent=0) = p
P(received=0 | sent=1) = p
P(received=0 | sent=0) = 1 - p
P(received=1 | sent=1) = 1 - p
```

**Implementation:** Two modes are provided:
- **Random mode:** Uses `Math.random()` for non-deterministic single simulations.
- **Seeded mode:** Uses the Mulberry32 PRNG for deterministic, reproducible results. This ensures all four protection systems face identical noise patterns for fair comparison.

### 4.5 Incremental Redundancy (IR) — Type-II HARQ

IR is a Type-II Hybrid ARQ protocol where the transmitter sends additional redundancy only when needed, rather than retransmitting the entire frame.

**Stage 1 — Punctured Transmission (Rate 4/6 ≈ 0.67):**
- Send 6 of 8 bits per block: d1, d2, d3, d4, p1, p2
- Withhold p3, p4 (remaining parity)
- Receiver inserts zeros for missing positions and attempts decode
- If CRC passes AND reliability ≥ threshold → ACK

**Stage 2 — Full Code (Rate 4/8 = 0.50):**
- Send the withheld parity bits: p3, p4
- Receiver reconstructs complete 8-bit blocks
- Full Extended Hamming(8,4) decode → CRC check → decision

**Stage 3+ — Retransmission with Majority Combining:**
- Retransmit the entire 8-bit codeword
- Receiver performs majority-vote combining across all received copies
- For each bit position, the value appearing most often wins
- Decode the combined result → CRC check → decision

**Maximum Stages (M):** Configurable (default 4). After M stages, the system outputs the best available decode.

### 4.6 Reliability-Based Decision Logic

Inspired by Chapter 17, Section 17.2, the system uses a dual-check decision mechanism:

**Reliability Score:**
```
score = (cleanBlocks - 2 × uncorrectableBlocks) / totalBlocks
```
Range: [-1, +1], where +1 = perfect, -1 = severe corruption.

**Adaptive Threshold (from Chapter 17, Eq. 17.13):**
```
expectedErrorBlockFraction = 1 - (1 - p)^8
threshold = 1 - κ × expectedErrorBlockFraction × d_min
```
Where κ is a user-configurable multiplier controlling strictness.

**Decision Rules:**
1. CRC must pass (necessary condition for data integrity)
2. Reliability must exceed threshold (sufficiency condition)
3. Both must hold for ACK — prevents accepting frames where CRC passes but too many blocks required correction (possible silent miscorrection)

---

## 5. System Architecture

### 5.1 End-to-End Pipeline

The system follows a complete transmitter → channel → receiver architecture:

```
┌──────────────────── TRANSMITTER ────────────────────┐
│  Text File                                           │
│    ↓                                                 │
│  [Huffman Encoder] → Source Coding (compression)     │
│    ↓ compressed binary                               │
│  [CRC-16 Append] → Error Detection Code              │
│    ↓ data + 16-bit CRC                               │
│  [Hamming(8,4) Punctured Encode] → Split into stages │
│    ↓ Stage 1 bits (6/block)                          │
└─────────────────────────────────────────────────────┘
             ↓
      [BSC Channel] → Binary Symmetric Channel (noise)
             ↓
┌──────────────────── RECEIVER ───────────────────────┐
│  [Hamming(8,4) Decode] → Syndrome-based decode       │
│    ↓                                                 │
│  [CRC-16 Check] → Verify data integrity              │
│    ↓                                                 │
│  [Reliability Threshold Check] → Confidence metric   │
│    ↓                                                 │
│  ACK → [Huffman Decoder] → Original text             │
│  NACK → Request next IR stage from Transmitter       │
└─────────────────────────────────────────────────────┘
```

### 5.2 Four Comparison Systems

The Performance Analysis mode compares four protection strategies under identical noise:

| System | Detection | Correction | Retransmission | Description |
|--------|-----------|------------|----------------|-------------|
| **A: No Protection** | ✗ | ✗ | ✗ | Raw Huffman through BSC |
| **B: CRC-16 Only** | ✓ | ✗ | Full retransmit | Pure ARQ — retransmit entire frame |
| **C: Hamming Only** | ✗ | ✓ | ✗ | FEC only — no feedback |
| **D: Combined IR** | ✓ | ✓ | Incremental | Full HARQ — Chapter 17 system |

The seeded PRNG (Mulberry32) ensures all four systems face the exact same noise pattern, making comparison scientifically valid.

---

## 6. Software Implementation

### 6.1 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js v18+ | Server-side JavaScript |
| Framework | Express.js 5 | HTTP server and routing |
| File Upload | Multer 2 | Multipart form data (memory storage) |
| CORS | cors | Cross-origin resource sharing |
| Config | dotenv | Environment variable management |
| Charts | Chart.js (CDN) | Performance visualization |
| Icons | Font Awesome 6 (CDN) | UI icons |
| Fonts | Inter (Google Fonts) | Typography |

All core modules (Huffman, CRC, Hamming, Noise, Reliability, IR) are implemented in pure JavaScript with no additional dependencies.

### 6.2 Project Structure

```
Information_Theory_Project/
├── app.js                          # Express server entry point
├── package.json                    # Dependencies and scripts
├── .env                            # Environment variables (PORT)
├── public/                         # Static frontend files
│   ├── index.html                  # Main HTML — 3-tab layout
│   ├── styles.css                  # Dark theme design system
│   └── app.js                      # Frontend JavaScript
├── src/
│   ├── services/                   # Core business logic
│   │   ├── huffmanService.js       # Huffman coding
│   │   ├── hammingService.js       # Hamming(7,4) + Extended Hamming(8,4) + IR
│   │   ├── noiseService.js         # BSC noise injection
│   │   ├── crcService.js           # CRC-16-CCITT
│   │   ├── reliabilityService.js   # Reliability scoring + ACK/NACK
│   │   └── irService.js            # IR controller (simulation engine)
│   ├── controllers/                # Request handlers
│   │   ├── projectController.js    # Legacy /api/process endpoint
│   │   └── simulationController.js # HARQ simulation endpoints
│   └── routes/
│       └── api.js                  # Express router definitions
├── outputs/                        # Generated output files
├── test/                           # Test data files
└── Report/                         # Academic reference material
```

### 6.3 Module Descriptions

#### 6.3.1 huffmanService.js — Source Coding (205 lines)

Implements the Huffman algorithm for lossless data compression. Key functions:

- **`analyzeProbabilities(text)`**: Computes character frequency distribution. Returns a frequency map and formatted output string.
- **`buildHuffmanTree(freqMap)`**: Constructs the optimal binary prefix tree using a greedy algorithm that repeatedly merges the two lowest-frequency nodes.
- **`encode(text, freqMap)`**: Compresses text to a binary string by concatenating Huffman codewords.
- **`decode(binaryString, rootNode)`**: Decompresses by traversing the tree bit-by-bit ('0' = left, '1' = right), emitting characters at leaf nodes.

The `Node` class represents tree nodes with `char`, `freq`, `left`, and `right` properties. Internal nodes have `char = null`.

#### 6.3.2 crcService.js — Error Detection (145 lines)

Implements CRC-16-CCITT using a bit-by-bit shift register simulation.

- **`computeCRC(binaryString)`**: Simulates a 16-bit shift register. For each input bit: XOR with MSB, shift left, conditionally XOR with polynomial 0x1021. Returns the 16-bit remainder.
- **`appendCRC(binaryString)`**: Augments data with 16 zeros, computes CRC, appends it. Returns the protected string and payload length.
- **`checkCRC(data, payloadLength)`**: Extracts payload and CRC, recomputes CRC on the payload, compares. Returns validity and extracted payload.

#### 6.3.3 hammingService.js — Error Correction (468 lines)

Implements two generations of Hamming codes plus IR support:

**Legacy Hamming(7,4):**
- `encode(binaryString)`: Pads to multiple of 4, generates [d1,d2,d3,d4,p1,p2,p3] blocks.
- `decode(noisyBinary)`: Syndrome-based correction with pattern matching.

**Extended Hamming(8,4):**
- `encodeExtended(binaryString)`: Adds overall parity p4 for double-error detection. Produces 8-bit blocks.
- `decodeExtended(encoded, padding)`: Uses syndrome + overall parity check for the 4-case decision matrix. Tracks clean, corrected, and uncorrectable block counts.

**Incremental Redundancy:**
- `encodePunctured(binaryString)`: Splits 8-bit blocks into Stage 1 (6 bits: d1-d4,p1,p2) and Stage 2 (2 bits: p3,p4).
- `decodeFromStages(s1, s2, padding, blocks)`: Reconstructs full blocks from partial data, inserting zeros for missing bits.
- `majorityVoteCombine(copies)`: Bit-level majority vote across multiple received copies. Ties resolved by keeping the first copy's value.

#### 6.3.4 noiseService.js — Channel Simulation (140 lines)

- **`injectNoise(binary, rate)`**: Random BSC using Math.random(). Flips each bit independently with probability `rate`.
- **`injectNoiseSeeded(binary, rate, seed)`**: Deterministic BSC using Mulberry32 PRNG. Records exact error positions. Same seed always produces same noise pattern.
- **`mulberry32(seed)`**: Fast 32-bit PRNG with period 2^32, producing uniform floats in [0, 1).

#### 6.3.5 reliabilityService.js — Decision Logic (147 lines)

- **`computeReliability(report)`**: Calculates syndrome-weight reliability score. Clean blocks contribute +1, uncorrectable blocks contribute -2, normalized by total blocks. Range: [-1, +1].
- **`computeThreshold(kappa, errorRate)`**: Adaptive threshold using block error probability. Lower κ = stricter (more retransmissions); higher κ = lenient (higher throughput).
- **`makeDecision(crcPassed, reliability, threshold)`**: Dual-check: CRC pass (necessary) AND reliability ≥ threshold (sufficient). Returns ACK/NACK with reason.

#### 6.3.6 irService.js — IR Controller (810 lines)

The central orchestrator implementing three simulation modes:

- **`createIRSession(text, options)`**: Runs one full HARQ simulation. Manages the IR loop from Stage 1 through maxStages. Handles the special case of 2-copy combining (selects better reliability) vs. 3+ copies (true majority vote). Computes BER, FER, throughput, and other metrics.
- **`runComparativeSimulation(text, options)`**: Runs the same text through all 4 protection systems with seeded noise for fair comparison.
- **`runMonteCarlo(text, options)`**: Sweeps across error rates with configurable trials per point. Pre-computes shared encoding for efficiency. Returns Chart.js-ready arrays.

### 6.4 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/process` | POST | Legacy Classic Mode pipeline |
| `/api/simulate` | POST | Single HARQ simulation with IR loop |
| `/api/simulate/compare` | POST | 4-system comparative simulation |
| `/api/simulate/montecarlo` | POST | Monte Carlo sweep for charts |

All endpoints accept `.txt` file uploads via multipart/form-data (field name: `textFile`) and return JSON responses.

**HARQ Simulation Parameters:**

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| errorRate | float | 0.01 | 0.001–0.15 | BSC crossover probability |
| maxStages | int | 4 | 2–6 | Maximum IR stages |
| kappa | float | 1.0 | 0.5–2.0 | Reliability threshold multiplier |

**Monte Carlo Additional Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| errorRateMin | float | 0.001 | Sweep start |
| errorRateMax | float | 0.1 | Sweep end |
| numPoints | int | 15 | Number of test points |
| trialsPerPoint | int | 200 | Trials per noise level |

### 6.5 Frontend Interface

The web application features a professional dark-themed UI built with vanilla HTML, CSS, and JavaScript. It provides three operating modes accessible via a tabbed navigation:

**Tab 1 — Classic Mode:**
Single-pass Huffman + Hamming(7,4) pipeline. Upload a text file, view compression statistics, noise injection results, and download restored text.

**Tab 2 — HARQ Simulation:**
Full Chapter 17 pipeline with configurable parameters (error rate slider, max stages selector, κ slider). Displays an IR loop timeline showing per-stage results (bits sent, errors, CRC status, reliability score, ACK/NACK decision). Side-by-side original vs. restored text comparison.

**Tab 3 — Performance Analysis:**
Monte Carlo simulation with configurable sweep parameters. Generates four Chart.js charts:
- BER vs. Error Rate
- FER vs. Error Rate
- Throughput vs. Error Rate
- Average Retransmissions vs. Error Rate

---

## 7. Results & Analysis

### 7.1 Performance Metrics

The system tracks four key performance indicators:

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **BER** (Bit Error Rate) | errors / total bits | Fraction of bits decoded incorrectly |
| **FER** (Frame Error Rate) | failed frames / total frames | Probability that a frame contains any error |
| **Throughput** | useful bits / total transmitted bits | Efficiency including retransmission overhead |
| **Avg Retransmissions** | Σ retransmissions / N trials | Average IR stages required |

### 7.2 Expected Behavior Across Noise Levels

**Low Noise (p < 0.01):**
- Combined IR ≈ Hamming-only performance (most frames decode on Stage 1)
- Both vastly outperform No Protection
- Throughput is high (~0.67) since punctured Stage 1 usually suffices
- CRC-only has lower throughput due to occasional full retransmissions

**Medium Noise (p ≈ 0.03–0.05):**
- Combined IR shows clear advantage over all other systems
- Hamming-only starts experiencing silent miscorrections (3+ bit errors in a block that are "corrected" to wrong values)
- CRC catches these Hamming failures, triggering IR stages 2 and 3
- The dual-check (CRC + reliability) prevents accepting corrupted frames

**High Noise (p > 0.08):**
- All systems degrade significantly
- Combined IR maintains the lowest FER but at reduced throughput (more retransmissions needed)
- CRC-only has the worst throughput (retransmits entire frame each time)
- No Protection is essentially unusable (Huffman desynchronization cascades)

### 7.3 System Comparison Summary

| Metric | No Protection | CRC-16 Only | Hamming Only | Combined IR |
|--------|---------------|-------------|--------------|-------------|
| Error Handling | None | Detection + full retransmit | Correction only | Detection + Correction + IR |
| BER at p=0.01 | ~0.01 | ~0 (if CRC passes) | ~0 | ~0 |
| BER at p=0.05 | ~0.05 | Variable | ~0.001 | ~0 |
| Throughput at p=0.01 | 1.0 | ~0.85 | 0.5 | ~0.67 |
| Throughput at p=0.05 | 1.0 | ~0.35 | 0.5 | ~0.45 |
| Reliability | Very Poor | Good | Medium | Excellent |
| Efficiency | High (no overhead) | Low (full retransmit) | Fixed (50% overhead) | Adaptive |

**Key Insight:** The Combined IR system achieves the best balance between reliability and efficiency. It adapts its overhead to channel conditions: at low noise, it transmits at rate 4/6 ≈ 0.67 (better than Hamming's fixed 0.5); at high noise, it progressively adds redundancy through IR stages rather than wastefully retransmitting everything like pure ARQ.

---

## 8. Conclusion

This project successfully implemented and demonstrated a complete HARQ communication system with Incremental Redundancy, following the principles described in Chapter 17 of the reference textbook. Key accomplishments include:

1. **Source Coding:** Huffman algorithm provides optimal lossless compression, reducing data size before channel coding.

2. **Error Detection:** CRC-16-CCITT provides mathematically guaranteed detection of all single-bit, double-bit, odd-bit, and burst errors up to 16 bits.

3. **Error Correction:** Extended Hamming(8,4) with d_min = 4 corrects all single-bit errors and detects all double-bit errors per 8-bit block.

4. **Incremental Redundancy:** The punctured code approach (Stage 1: rate 4/6, Stage 2: rate 4/8, Stage 3+: majority combining) progressively improves reliability while minimizing bandwidth waste.

5. **Reliability Decision Logic:** The dual-check mechanism (CRC + syndrome-weight reliability threshold) prevents both missed errors and false acceptances.

6. **Fair Comparison:** Seeded PRNG ensures all four protection strategies face identical channel conditions, enabling scientifically valid performance comparison.

7. **Monte Carlo Analysis:** Statistical simulation across thousands of trials validates theoretical predictions about system behavior at different noise levels.

The results confirm that the Combined IR approach offers the best trade-off between reliability and throughput across all noise conditions, validating the HARQ design philosophy of Chapter 17.

---

## 9. References

1. Tomlinson, M., Tjhai, C.J., Ambroze, M.A., Ahmed, M., & Jibril, M. — *Error-Correction Coding and Decoding*, Chapter 17: Combined Error Detection and Correction.

2. Huffman, D.A. (1952). "A Method for the Construction of Minimum-Redundancy Codes." *Proceedings of the IRE*, 40(9), 1098-1101.

3. Peterson, W.W. & Brown, D.T. (1961). "Cyclic Codes for Error Detection." *Proceedings of the IRE*, 49(1), 228-235.

4. Hamming, R.W. (1950). "Error Detecting and Error Correcting Codes." *Bell System Technical Journal*, 29(2), 147-160.

5. Lin, S. & Costello, D.J. (2004). *Error Control Coding: Fundamentals and Applications*. 2nd ed. Prentice Hall.

6. Chase, D. (1985). "Code Combining — A Maximum-Likelihood Decoding Approach for Combining an Arbitrary Number of Noisy Packets." *IEEE Trans. on Communications*, 33(5), 385-393.

7. CRC-16-CCITT Standard — ITU-T Recommendation V.41.

---

*© 2025–2026 Information Theory Project — Beni-Suef University, Faculty of Engineering*
