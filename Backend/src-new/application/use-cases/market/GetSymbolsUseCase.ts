import { inject, injectable } from "tsyringe";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";

interface GetSymbolsInput {
  category?: string;
  activeOnly: boolean;
}

interface GetSymbolsOutput {
  symbols: BrokerSymbol[];
}

@injectable()
export class GetSymbolsUseCase {
  constructor(
    @inject("SymbolRepository") private symbolRepo: SymbolRepository
  ) {}

  async execute(input: GetSymbolsInput): Promise<GetSymbolsOutput> {
    const symbols = input.activeOnly 
      ? await this.symbolRepo.findActive()
      : await this.symbolRepo.findAll();
    
    if (input.category) {
      return { symbols: symbols.filter(s => s.category === input.category) };
    }
    
    return { symbols };
  }
}