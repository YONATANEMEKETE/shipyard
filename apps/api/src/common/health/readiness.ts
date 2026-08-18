let ready = false;

export function isReady(): boolean {
  return ready;
}

export function setReady(value: boolean): void {
  ready = value;
}
