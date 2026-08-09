import { BrokerSymbol } from "../entities/BrokerSymbol.js";

export interface SymbolRepository {
  save(symbol: BrokerSymbol): Promise<BrokerSymbol>;
  saveMany(symbols: BrokerSymbol[]): Promise<number>;
  findAll(): Promise<BrokerSymbol[]>;
  findActive(): Promise<BrokerSymbol[]>;
  findByCategory(category: string): Promise<BrokerSymbol[]>;
  findById(symbol: string): Promise<BrokerSymbol | null>;
}