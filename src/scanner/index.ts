/**
 * SPDX-License-Identifier: Apache-2.0
 * (was AGPL-3.0-only until 2026-06-02)
 * Content Scanner — orchestrates PDQ + ML + AI-CSAM detectors.
 *
 * ZERO CSAM storage by design:
 * - All content passes through memory volatile only
 * - Hash extracted, then content destroyed
 * - Only stores: SHA-256, perceptual hashes (PDQ/TMK), embedding vectors, metadata
 */

import { nanoid } from 'nanoid';
import { log } from '../common/logger';
import { CaseId } from '../common/types';
import type { ContentHash } from '../common/types';
import { type SandboxPolicy } from '../sandbox/index';
import { computePDQ } from './pdq';
import { MLClassifier } from './ml';
import { detectSynthetic } from './ai-csam';
import type {
  ScanInput,
  ScanResult,
  Classification,
  MLClassificationResult,
  SyntheticDetectionResult,
} from './types';

// Detection thresholds
const THRESHOLDS = {
  csamKnown: 0.8,      // PDQ hash match confidence
  csamNew: 0.7,       // ML classifier score
  csamSynthetic: 0.6, // AI-CSAM detector confidence
  review: 0.4,        // Flag for human review
  clean: 0.2,         // Maximum for clean classification
} as const;

/**
 * Default sandbox policy for ML inference subprocesses.
 *
 * NOTE: ML/YOLOv8/ViT inference is currently in-process stubs (see
 * scanner/ml.ts and scanner/ai-csam.ts) and does not spawn subprocesses
 * yet. When real ONNX inference is added (Phase 2), wrap the subprocess
 * call with:
 *
 *   import { spawnSandboxed } from '../sandbox/index';
 *   const result = await spawnSandboxed(
 *     ['/usr/bin/python3', '/opt/apohara-guard/infer.py', inputPath],
 *     ML_INFERENCE_POLICY,
 *   );
 *
 * This policy is exported for use by future inference workers and for
 * static auditing of the trust boundary.
 */
export const ML_INFERENCE_POLICY: SandboxPolicy = {
  allowed_read_paths: ['/opt/apohara-guard/models', '/tmp/scan-input'],
  allowed_write_paths: ['/tmp/scan-output'],
  allow_network: false, // ML inference must not exfiltrate
  max_memory_mb: 2048,
  allow_unsupported_platform_fallback: true, // allow dev on macOS
};

/**
 * ContentScanner orchestrates three detection approaches:
 * 1. PDQ Hash — perceptual hashing for known CSAM
 * 2. ML Classifier — YOLOv8 + ViT for new (unseen) CSAM
 * 3. AI-CSAM Detector — detects synthetic/AI-generated CSAM
 */
export class ContentScanner {
  private mlClassifier: MLClassifier;

  constructor() {
    this.mlClassifier = new MLClassifier();
  }

  /**
   * Scan content using all three detectors in parallel.
   *
   * Buffer is memory-volatile — processed and destroyed immediately.
   * Only hashes and embeddings are stored, never actual content.
   */
  async scan(input: ScanInput): Promise<ScanResult> {
    const caseId = CaseId(nanoid());

    log.info({ caseId, filename: input.filename }, 'Starting scan');

    // Run all detectors in parallel
    const [pdqResult, mlResult, syntheticResult] = await Promise.all([
      this.runPDQ(input.buffer),
      this.runML(input.buffer, input.mimeType),
      this.runSynthetic(input.buffer),
    ]);

    // Determine classification based on all detectors
    const classification = this.classify(pdqResult, mlResult, syntheticResult);

    // Extract embedding for potential similarity search
    const embedding = await this.mlClassifier.extractEmbedding(input.buffer);

    const result: ScanResult = {
      caseId,
      hashes: pdqResult,
      classification,
      confidence: this.computeConfidence(pdqResult, mlResult, syntheticResult),
      isSynthetic: syntheticResult.isSynthetic,
      neuralScore: mlResult.score,
      embedding,
    };

    log.info(
      { caseId, classification, confidence: result.confidence },
      'Scan complete',
    );

    return result;
  }

  /**
   * Run PDQ hash computation.
   * Returns array of content hashes (SHA-256 placeholder).
   */
  private async runPDQ(buffer: ArrayBuffer): Promise<ContentHash[]> {
    try {
      const hash = await computePDQ(buffer);
      return [hash];
    } catch (error) {
      log.error({ error }, 'PDQ hash computation failed');
      return [];
    }
  }

  /**
   * Run ML classifier (YOLOv8 + ViT stub).
   */
  private async runML(
    buffer: ArrayBuffer,
    mimeType: string,
  ): Promise<MLClassificationResult> {
    try {
      return await this.mlClassifier.classify(buffer, mimeType);
    } catch (error) {
      log.error({ error }, 'ML classification failed');
      return { score: 0.0, isSynthetic: false };
    }
  }

  /**
   * Run synthetic content detector (AI-CSAM stub).
   */
  private async runSynthetic(
    buffer: ArrayBuffer,
  ): Promise<SyntheticDetectionResult> {
    try {
      return await detectSynthetic(buffer);
    } catch (error) {
      log.error({ error }, 'Synthetic detection failed');
      return { isSynthetic: false, confidence: 0.0, artifacts: [] };
    }
  }

  /**
   * Classify based on all detector results.
   * Returns highest-confidence classification, or 'clean' if all below threshold.
   */
  private classify(
    pdqHashes: ContentHash[],
    mlResult: MLClassificationResult,
    syntheticResult: SyntheticDetectionResult,
  ): Classification {
    // TODO: Real implementation would query PDQ hash database for known CSAM
    // Stub only has SHA-256 placeholder — never matches real database
    const hasKnownHash = false; // Always false until real PDQ database integration

    // Determine highest confidence classification
    if (mlResult.score >= THRESHOLDS.csamNew) {
      return 'csam_new';
    }

    if (syntheticResult.confidence >= THRESHOLDS.csamSynthetic) {
      return 'csam_synthetic';
    }

    if (hasKnownHash) {
      return 'csam_known';
    }

    return 'clean';
  }

  /**
   * Compute overall confidence score from all detectors.
   */
  private computeConfidence(
    pdqHashes: ContentHash[],
    mlResult: MLClassificationResult,
    syntheticResult: SyntheticDetectionResult,
  ): number {
    // Weighted combination of detection confidence scores
    const mlWeight = 0.4;
    const syntheticWeight = 0.3;
    const pdqWeight = 0.3;

    let maxConfidence = 0;

    // TODO: Real implementation would check actual PDQ database match
    // Stub uses placeholder hash — not a real PDQ match
    const hasKnownHash = false; // Always false until real PDQ database

    if (hasKnownHash) {
      maxConfidence = Math.max(maxConfidence, pdqWeight);
    }

    maxConfidence = Math.max(
      maxConfidence,
      mlResult.score * mlWeight,
    );

    maxConfidence = Math.max(
      maxConfidence,
      syntheticResult.confidence * syntheticWeight,
    );

    return Math.min(1.0, maxConfidence);
  }
}

// Default scanner instance
export const scanner = new ContentScanner();
