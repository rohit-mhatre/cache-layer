import winston from 'winston';
import { Config } from './Config';

export class Logger {
  private static instance: winston.Logger;

  public static getInstance(): winston.Logger {
    if (!Logger.instance) {
      const config = Config.getInstance().get();
      
      Logger.instance = winston.createLogger({
        level: config.logLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        defaultMeta: { service: 'cache-layer' },
        transports: [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' })
        ]
      });

      if (process.env.NODE_ENV !== 'production') {
        Logger.instance.add(new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }));
      }
    }

    return Logger.instance;
  }

  public static debug(message: string, meta?: any): void {
    Logger.getInstance().debug(message, meta);
  }

  public static info(message: string, meta?: any): void {
    Logger.getInstance().info(message, meta);
  }

  public static warn(message: string, meta?: any): void {
    Logger.getInstance().warn(message, meta);
  }

  public static error(message: string, error?: Error | any): void {
    Logger.getInstance().error(message, error);
  }
}