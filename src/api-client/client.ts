/**
 * Typed SWALL API client. Transport, response decoding, and runtime
 * protocol parsing only -- no cryptographic trust decisions, no
 * environment reading, no archive writes. See README.md for the full
 * boundary and the exact HTTP contract this ports from
 * scripts/sign-sth.js's fetchJSON()/postJSON() and their call sites.
 */

import type { LatestSTHResponse, IdentityDocument, WitnessPostRequest, WitnessPostResponse } from '../protocol/types.js';
import { parseLatestSTHResponse, parseIdentityDocument, parseWitnessPostResponse } from '../protocol/validate.js';

export interface SwallApiClient {
  getLatestSTH(): Promise<LatestSTHResponse>;
  getIdentityDocument(): Promise<IdentityDocument>;
  postWitnessSignature(request: WitnessPostRequest): Promise<WitnessPostResponse>;
}

export interface SwallApiClientConfig {
  /**
   * Base URL for the SWALL API. Both /swall/log/sth/* and
   * /.well-known/swall.json are served from this same origin today --
   * scripts/sign-sth.js has no separate "authority URL" concept, so this
   * client doesn't invent one either.
   */
  baseUrl: string;
  /** Injectable fetch implementation, defaulting to the global fetch. For tests only. */
  fetchImpl?: typeof fetch;
}

export function createSwallApiClient(config: SwallApiClientConfig): SwallApiClient {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;

  async function getJSON(url: string): Promise<unknown> {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const json: unknown = await res.json();
    return json;
  }

  async function getLatestSTH(): Promise<LatestSTHResponse> {
    const json = await getJSON(`${baseUrl}/swall/log/sth/latest`);
    return parseLatestSTHResponse(json);
  }

  async function getIdentityDocument(): Promise<IdentityDocument> {
    const json = await getJSON(`${baseUrl}/.well-known/swall.json`);
    return parseIdentityDocument(json);
  }

  async function postWitnessSignature(request: WitnessPostRequest): Promise<WitnessPostResponse> {
    const url = `${baseUrl}/swall/log/sth/witness`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`POST ${url} → HTTP ${res.status}: ${text}`);
    }
    const json: unknown = await res.json();
    return parseWitnessPostResponse(json);
  }

  return { getLatestSTH, getIdentityDocument, postWitnessSignature };
}
