export interface WsOptions {
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

export function connectWs(path: string, options: WsOptions): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws/${path}`;
  const ws = new WebSocket(url);

  ws.onmessage = (event: MessageEvent) => {
    const data: unknown = JSON.parse(event.data as string);
    options.onMessage(data);
  };

  ws.onopen = () => options.onOpen?.();
  ws.onclose = (event) => options.onClose?.(event);
  ws.onerror = (event) => options.onError?.(event);

  return ws;
}
