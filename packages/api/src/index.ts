// hugo-api — call any endpoint by the line the API reference prints, read it into React with one hook.
export { configure, request, call, useApi, invalidate, type ApiError } from './client';
export { resolveEndpoint, moduleOf, suggest, type Endpoint, type Method, type CallArgs, type Register } from './endpoint';
export { createHttpClient, backoffMs, type HttpOptions, type HttpResult } from './http';
export { snippetsFor } from './snippets';
