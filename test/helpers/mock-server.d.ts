/**
 * Type declaration for mock-server.js -- describes shape only.
 */

export interface MockServerCall {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface MockServerRouteResult {
  status?: number;
  body?: unknown;
  /** A literal response body (e.g. to simulate malformed/non-JSON responses), used instead of `body`. */
  rawBody?: string;
  contentType?: string;
}

export type MockServerRouteHandler = (
  body: unknown
) => MockServerRouteResult | Promise<MockServerRouteResult>;

export interface MockServer {
  url: string;
  calls: MockServerCall[];
  close(): Promise<void>;
}

export function startMockServer(routes: Record<string, MockServerRouteHandler>): Promise<MockServer>;
