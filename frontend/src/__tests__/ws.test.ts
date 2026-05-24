import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectWs } from '../lib/ws';

class MockWebSocket {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }
}

describe('connectWs', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('constructs WebSocket URL from current location', () => {
    const onMessage = vi.fn();
    const ws = connectWs('audit-review/123/', { onMessage });
    expect(ws.url).toBe('ws://localhost:3000/ws/audit-review/123/');
  });

  it('parses JSON messages and passes to onMessage', () => {
    const onMessage = vi.fn();
    const ws = connectWs('test/', { onMessage });

    const event = new MessageEvent('message', {
      data: JSON.stringify({ type: 'token', value: 'hello' }),
    });
    ws.onmessage!(event);

    expect(onMessage).toHaveBeenCalledWith({ type: 'token', value: 'hello' });
  });

  it('calls onOpen callback when connected', () => {
    const onOpen = vi.fn();
    const ws = connectWs('test/', { onMessage: vi.fn(), onOpen });
    const event = new Event('open');
    ws.onopen!(event);
    expect(onOpen).toHaveBeenCalled();
  });

  it('calls onError callback on error', () => {
    const onError = vi.fn();
    const ws = connectWs('test/', { onMessage: vi.fn(), onError });
    const event = new Event('error');
    ws.onerror!(event);
    expect(onError).toHaveBeenCalledWith(event);
  });
});
