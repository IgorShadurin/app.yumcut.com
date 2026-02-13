export function statusMessage(status: string) {
  switch (status) {
    case 'error':
      return 'Dummy error: processing failed';
    case 'cancelled':
      return 'Dummy project cancelled by user';
    case 'done':
      return 'Dummy project completed successfully';
    default:
      return `Dummy status: ${status}`;
  }
}
