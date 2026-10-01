import { Response } from 'express';

export class BaseController {
  protected handleSuccess<T>(res: Response, data: T, statusCode = 200): void {
    res.status(statusCode).json({
      success: true,
      data,
    });
  }

  protected handleError(error: unknown, res: Response, context: string): void {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    
    // In production, we would capture this in Sentry
    console.error(`[Error in ${context}]:`, error);

    res.status(500).json({
      success: false,
      error: message,
    });
  }
}
