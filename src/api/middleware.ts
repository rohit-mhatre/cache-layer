import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/Logger';
import Joi from 'joi';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    Logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  Logger.error('Unhandled error:', error);
  
  const response: ApiResponse = {
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    timestamp: Date.now()
  };
  
  res.status(500).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    timestamp: Date.now()
  };
  
  res.status(404).json(response);
};

export const validateKey = (req: Request, res: Response, next: NextFunction) => {
  const { key } = req.params;
  
  const schema = Joi.string()
    .min(1)
    .max(512)
    .pattern(/^[a-zA-Z0-9_:-]+$/)
    .required();
    
  const { error } = schema.validate(key);
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: `Invalid key format: ${error.details[0]?.message}`,
      timestamp: Date.now()
    };
    return res.status(400).json(response);
  }
  
  next();
};

export const validateCachePayload = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    key: Joi.string()
      .min(1)
      .max(512)
      .pattern(/^[a-zA-Z0-9_:-]+$/)
      .required(),
    value: Joi.any().required(),
    ttl: Joi.number().integer().min(0).max(86400 * 365).optional()
  });
  
  const { error } = schema.validate(req.body);
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: `Invalid payload: ${error.details[0]?.message}`,
      timestamp: Date.now()
    };
    return res.status(400).json(response);
  }
  
  next();
};

export const validateBatchPayload = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    operations: Joi.array().items(
      Joi.object({
        key: Joi.string()
          .min(1)
          .max(512)
          .pattern(/^[a-zA-Z0-9_:-]+$/)
          .required(),
        value: Joi.any().required(),
        ttl: Joi.number().integer().min(0).max(86400 * 365).optional()
      })
    ).min(1).max(100).required()
  });
  
  const { error } = schema.validate(req.body);
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: `Invalid batch payload: ${error.details[0]?.message}`,
      timestamp: Date.now()
    };
    return res.status(400).json(response);
  }
  
  next();
};

export const rateLimiter = (() => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  const WINDOW_MS = 60000;
  const MAX_REQUESTS = 1000;
  
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const client = requests.get(clientId);
    
    if (!client || now > client.resetTime) {
      requests.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
      return next();
    }
    
    if (client.count >= MAX_REQUESTS) {
      const response: ApiResponse = {
        success: false,
        error: 'Rate limit exceeded',
        timestamp: Date.now()
      };
      return res.status(429).json(response);
    }
    
    client.count++;
    next();
  };
})();

export const createSuccessResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: Date.now()
});

export const createErrorResponse = (error: string): ApiResponse => ({
  success: false,
  error,
  timestamp: Date.now()
});