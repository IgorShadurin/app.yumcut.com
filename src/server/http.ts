import { NextResponse } from 'next/server';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as any, init);
}

export function error(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function unauthorized(message = 'Unauthorized') {
  return error('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'Forbidden') {
  return error('FORBIDDEN', message, 403);
}

export function notFound(message = 'Not found') {
  return error('NOT_FOUND', message, 404);
}

export function conflict(message = 'Conflict') {
  return error('CONFLICT', message, 409);
}

export function internal(message = 'Internal server error', details?: unknown) {
  return error('INTERNAL_ERROR', message, 500, details);
}

