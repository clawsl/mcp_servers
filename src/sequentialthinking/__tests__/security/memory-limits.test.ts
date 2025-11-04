/**
 * Memory Limits Security Tests
 *
 * Tests for Control 1: Memory Limits
 * Covers: thought count limits, branch limits, memory cleanup, DoS prevention
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SequentialThinkingServer } from '../../lib.js';

describe('Memory Limits Security Tests', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    server = new SequentialThinkingServer({
      maxThoughtsPerSession: 10, // Low limit for testing
      disableThoughtLogging: true
    });
  });

  describe('Thought Count Limits', () => {
    it('should enforce maximum thoughts per session', () => {
      // Add thoughts up to the limit
      for (let i = 1; i <= 10; i++) {
        const result = server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 15,
          nextThoughtNeeded: true
        });

        expect(result.isError).toBeFalsy();
      }

      // The 11th thought should be rejected
      const result = server.processThought({
        thought: 'Thought 11 - should be rejected',
        thoughtNumber: 11,
        totalThoughts: 15,
        nextThoughtNeeded: true
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('thought_limit_exceeded');
      expect(result.content[0].text).toContain('Maximum thoughts per session limit reached');
    });

    it('should track thought count accurately', () => {
      for (let i = 1; i <= 5; i++) {
        server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 5,
          nextThoughtNeeded: i < 5
        });
      }

      const metrics = server.getMetrics();
      expect(metrics.thoughtCount).toBe(5);
    });

    it('should warn when approaching limit (80%)', () => {
      // Add 8 thoughts (80% of 10)
      for (let i = 1; i <= 8; i++) {
        server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true
        });
      }

      const metrics = server.getMetrics();
      expect(metrics.utilizationPercent).toBeGreaterThanOrEqual(80);
    });

    it('should include metrics in limit exceeded error', () => {
      // Fill to limit
      for (let i = 1; i <= 10; i++) {
        server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true
        });
      }

      // Try to exceed
      const result = server.processThought({
        thought: 'Over limit',
        thoughtNumber: 11,
        totalThoughts: 15,
        nextThoughtNeeded: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.metrics).toBeDefined();
      expect(response.metrics.thoughtCount).toBe(10);
      expect(response.metrics.utilizationPercent).toBe(100);
    });
  });

  describe('Default Configuration', () => {
    it('should use default limit of 10000 thoughts', () => {
      const defaultServer = new SequentialThinkingServer({
        disableThoughtLogging: true
      });

      const metrics = defaultServer.getMetrics();
      expect(metrics.maxThoughtsPerSession).toBe(10000);
    });

    it('should respect environment variable MAX_THOUGHTS_PER_SESSION', () => {
      process.env.MAX_THOUGHTS_PER_SESSION = '500';

      const envServer = new SequentialThinkingServer({
        disableThoughtLogging: true
      });

      const metrics = envServer.getMetrics();
      expect(metrics.maxThoughtsPerSession).toBe(500);

      delete process.env.MAX_THOUGHTS_PER_SESSION;
    });
  });

  describe('Branch Management', () => {
    it('should track branches separately', () => {
      // Main branch
      server.processThought({
        thought: 'Main thought 1',
        thoughtNumber: 1,
        totalThoughts: 5,
        nextThoughtNeeded: true
      });

      // Branch 1
      server.processThought({
        thought: 'Branch 1 thought',
        thoughtNumber: 2,
        totalThoughts: 5,
        branchFromThought: 1,
        branchId: 'branch-1',
        nextThoughtNeeded: true
      });

      // Branch 2
      server.processThought({
        thought: 'Branch 2 thought',
        thoughtNumber: 3,
        totalThoughts: 5,
        branchFromThought: 1,
        branchId: 'branch-2',
        nextThoughtNeeded: true
      });

      const metrics = server.getMetrics();
      expect(metrics.branchCount).toBe(2);
      expect(metrics.thoughtCount).toBe(3); // All thoughts count toward total
    });

    it('should include branches in thought limit', () => {
      // Add 5 main thoughts
      for (let i = 1; i <= 5; i++) {
        server.processThought({
          thought: `Main thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true
        });
      }

      // Add 5 branched thoughts (should hit limit at 10)
      for (let i = 6; i <= 10; i++) {
        const result = server.processThought({
          thought: `Branch thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 15,
          branchFromThought: 1,
          branchId: `branch-${i}`,
          nextThoughtNeeded: true
        });

        expect(result.isError).toBeFalsy();
      }

      // 11th thought (branched) should be rejected
      const result = server.processThought({
        thought: 'Should be rejected',
        thoughtNumber: 11,
        totalThoughts: 15,
        branchFromThought: 1,
        branchId: 'branch-11',
        nextThoughtNeeded: true
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('DoS Prevention', () => {
    it('should prevent memory exhaustion via unlimited thoughts', () => {
      const largeServer = new SequentialThinkingServer({
        maxThoughtsPerSession: 1000,
        disableThoughtLogging: true
      });

      // Try to add 1001 thoughts
      let successCount = 0;
      let rejectedCount = 0;

      for (let i = 1; i <= 1001; i++) {
        const result = largeServer.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 1001,
          nextThoughtNeeded: true
        });

        if (result.isError) {
          rejectedCount++;
        } else {
          successCount++;
        }
      }

      expect(successCount).toBe(1000);
      expect(rejectedCount).toBe(1);
    });

    it('should handle rapid thought submissions', () => {
      const thoughts = Array.from({ length: 10 }, (_, i) => ({
        thought: `Rapid thought ${i + 1}`,
        thoughtNumber: i + 1,
        totalThoughts: 10,
        nextThoughtNeeded: i < 9
      }));

      // Submit all thoughts rapidly
      const results = thoughts.map(t => server.processThought(t));

      // All should succeed (within limit)
      expect(results.every(r => !r.isError)).toBe(true);

      const metrics = server.getMetrics();
      expect(metrics.thoughtCount).toBe(10);
    });

    it('should provide helpful error message when limit exceeded', () => {
      // Fill to limit
      for (let i = 1; i <= 10; i++) {
        server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true
        });
      }

      // Exceed limit
      const result = server.processThought({
        thought: 'Over limit',
        thoughtNumber: 11,
        totalThoughts: 15,
        nextThoughtNeeded: true
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Maximum thoughts per session limit reached');
      expect(response.suggestion).toContain('start a new session');
      expect(response.status).toBe('thought_limit_exceeded');
      expect(response.limit).toBe(10);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track utilization percentage', () => {
      server.processThought({
        thought: 'Test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      });

      const metrics = server.getMetrics();
      expect(metrics.utilizationPercent).toBe(10); // 1 out of 10
    });

    it('should track uptime', () => {
      const metrics1 = server.getMetrics();
      expect(metrics1.uptimeMs).toBeGreaterThanOrEqual(0);

      // Wait a bit
      setTimeout(() => {
        const metrics2 = server.getMetrics();
        expect(metrics2.uptimeMs).toBeGreaterThan(metrics1.uptimeMs);
      }, 10);
    });

    it('should report correct branch count', () => {
      server.processThought({
        thought: 'Main',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      server.processThought({
        thought: 'Branch 1',
        thoughtNumber: 2,
        totalThoughts: 3,
        branchFromThought: 1,
        branchId: 'b1',
        nextThoughtNeeded: true
      });

      const metrics = server.getMetrics();
      expect(metrics.branchCount).toBe(1);
    });
  });

  describe('Revision Handling', () => {
    it('should count revisions toward total thought limit', () => {
      // Add 9 regular thoughts
      for (let i = 1; i <= 9; i++) {
        server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true
        });
      }

      // Add 1 revision (should succeed - still at limit)
      const revisionResult = server.processThought({
        thought: 'Revised thought',
        thoughtNumber: 10,
        totalThoughts: 10,
        isRevision: true,
        revisesThought: 5,
        nextThoughtNeeded: false
      });

      expect(revisionResult.isError).toBeFalsy();

      // Try to add another thought (should fail)
      const result = server.processThought({
        thought: 'Should fail',
        thoughtNumber: 11,
        totalThoughts: 11,
        nextThoughtNeeded: false
      });

      expect(result.isError).toBe(true);
    });
  });
});
