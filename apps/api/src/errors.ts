export class AppError extends Error {
 constructor(public code: string, public statusCode = 400, public fields?: unknown) { super(code); }
}
