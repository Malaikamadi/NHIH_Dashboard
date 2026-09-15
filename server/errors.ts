export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 404 | 409 | 500 | 503,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
