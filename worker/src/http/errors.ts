export class RequestError extends Error {
  readonly status: number;
  readonly fields?: readonly string[];

  constructor(message: string, status: number, fields?: readonly string[]) {
    super(message);
    this.name = "RequestError";
    this.status = status;

    if (fields !== undefined) {
      this.fields = fields;
    }
  }
}
