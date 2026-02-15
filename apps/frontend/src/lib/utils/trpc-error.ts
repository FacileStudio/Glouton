export function getTrpcErrorMessage(error: any): string {
  /**
   * if
   */
  if (typeof error === 'string') return error;

  /**
   * if
   */
  if (error?.message) {
    try {
      const parsed = JSON.parse(error.message);
      /**
       * if
       */
      if (Array.isArray(parsed) && parsed[0]?.message) {
        return parsed[0].message;
      }
    } catch {
      return error.message;
    }
  }

  /**
   * if
   */
  if (error?.data?.zodError?.fieldErrors) {
    const fieldErrors = error.data.zodError.fieldErrors;
    const firstField = Object.keys(fieldErrors)[0];
    return fieldErrors[firstField]?.[0] || 'Validation error';
  }

  /**
   * if
   */
  if (error?.shape?.message) return error.shape.message;

  return 'An unexpected error occurred';
}
