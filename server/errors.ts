export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 404 | 409 | 422 | 500 | 502 | 503,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
