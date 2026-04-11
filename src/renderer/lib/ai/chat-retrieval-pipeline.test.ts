import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyQueryComplexity,
  expandSeedConnections,
  shouldBlendGlobalFallback
} from '@/lib/ai/chat-retrieval-pipeline'
import type { WorkspaceLinkMentionIndex } from '@/lib/notes/cache/notes-cache-types'

test('classifyQueryComplexity returns efficiency for short factual queries', () => {
  assert.equal(classifyQueryComplexity('What is Redux?'), 'efficiency')
})

test('classifyQueryComplexity returns high for synthesis-style queries', () => {
  assert.equal(
    classifyQueryComplexity('Compare these design notes across projects and summarize the themes'),
    'high'
  )
})

test('classifyQueryComplexity returns medium for general queries', () => {
  assert.equal(classifyQueryComplexity('Tell me about the roadmap notes'), 'medium')
})

test('expandSeedConnections keeps the highest weight and excludes seeds', () => {
  const index: WorkspaceLinkMentionIndex = {
    validPaths: new Set(['a', 'b', 'c', 'd']),
    outgoingBySource: new Map([
      ['a', [{ source: 'a', target: 'b', contextText: '', linkText: '' }]],
      ['b', [{ source: 'b', target: 'c', contextText: '', linkText: '' }]],
      ['d', [{ source: 'd', target: 'b', contextText: '', linkText: '' }]]
    ]),
    backlinksByTarget: new Map([
      ['b', [{ source: 'd', target: 'b', contextText: '', linkText: '' }]],
      ['c', [{ source: 'b', target: 'c', contextText: '', linkText: '' }]]
    ])
  }

  assert.deepEqual(expandSeedConnections(['a'], index, 10), [
    { note: 'b', weight: 1, hops: 1 },
    { note: 'd', weight: 0.6, hops: 2 },
    { note: 'c', weight: 0.6, hops: 2 }
  ])
})

test('shouldBlendGlobalFallback triggers for low or missing scores', () => {
  assert.equal(shouldBlendGlobalFallback(0.64), true)
  assert.equal(shouldBlendGlobalFallback(0.65), false)
  assert.equal(shouldBlendGlobalFallback(null), true)
})
