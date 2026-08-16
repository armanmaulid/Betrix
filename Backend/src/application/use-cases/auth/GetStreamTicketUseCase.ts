import { inject, injectable } from "tsyringe";
import { randomBytes } from "crypto";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { StreamTicketStore } from "@domain/repositories/StreamTicketStore.js";
import { AuthenticationError } from "@core/errors/index.js";

// TTL ticket: 30–60 dtk per kontrak Phase 2 (cukup untuk satu koneksi SSE;
// EventSource yang reconnect harus minta ticket baru).
const STREAM_TICKET_TTL_SECONDS = 60;

interface GetStreamTicketInput {
  sessionToken: string;
}

@injectable()
export class GetStreamTicketUseCase {
  constructor(
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("StreamTicketStore") private ticketStore: StreamTicketStore
  ) {}

  /**
   * Tukar session token → ticket opaque sekali pakai untuk URL SSE.
   * Ticket menyimpan sessionToken; saat connect, stream middleware tetap
   * memvalidasi session — logout langsung membatalkan ticket.
   */
  async execute(input: GetStreamTicketInput): Promise<{ ticket: string }> {
    const session = await this.sessionRepo.findByToken(input.sessionToken);
    if (!session) {
      throw new AuthenticationError("Session not found or expired");
    }

    const ticket = randomBytes(32).toString("hex");
    await this.ticketStore.save(ticket, input.sessionToken, STREAM_TICKET_TTL_SECONDS);
    return { ticket };
  }
}
