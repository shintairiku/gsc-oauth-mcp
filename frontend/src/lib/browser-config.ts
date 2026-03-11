export function getBrowserBackendOrigin(): string {
  return process.env.NEXT_PUBLIC_BACKEND_ORIGIN ?? "http://localhost:8080";
}
