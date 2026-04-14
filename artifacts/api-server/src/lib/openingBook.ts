import { Chess } from "chess.js";

const OPENING_LINES: string[] = [
  // === A: Flank Openings ===
  // A00 Irregular
  "1.g4", "1.b4", "1.b4 e5", "1.b4 e5 2.Bb2", "1.f4", "1.f4 d5", "1.f4 e5",
  // A01-A03 Larsen, Bird
  "1.b3", "1.b3 e5", "1.b3 d5", "1.f4 d5 2.Nf3", "1.f4 d5 2.Nf3 Nf6", "1.f4 d5 2.Nf3 Nf6 3.e3",
  // A04-A09 Reti
  "1.Nf3", "1.Nf3 d5", "1.Nf3 d5 2.c4", "1.Nf3 d5 2.g3", "1.Nf3 d5 2.c4 c6",
  "1.Nf3 d5 2.c4 e6", "1.Nf3 d5 2.c4 d4", "1.Nf3 d5 2.c4 dxc4",
  "1.Nf3 Nf6", "1.Nf3 Nf6 2.c4", "1.Nf3 Nf6 2.g3", "1.Nf3 Nf6 2.c4 g6",
  "1.Nf3 Nf6 2.c4 e6", "1.Nf3 Nf6 2.c4 c5",
  // A10-A39 English
  "1.c4", "1.c4 e5", "1.c4 e5 2.Nc3", "1.c4 e5 2.Nc3 Nf6",
  "1.c4 e5 2.Nc3 Nf6 3.Nf3", "1.c4 e5 2.Nc3 Nc6", "1.c4 e5 2.g3",
  "1.c4 Nf6", "1.c4 Nf6 2.Nc3", "1.c4 Nf6 2.Nc3 e6", "1.c4 Nf6 2.Nc3 g6",
  "1.c4 Nf6 2.Nc3 e5", "1.c4 Nf6 2.g3",
  "1.c4 c5", "1.c4 c5 2.Nf3", "1.c4 c5 2.Nc3", "1.c4 c5 2.Nf3 Nf6",
  "1.c4 c5 2.Nf3 Nc6", "1.c4 c5 2.Nc3 Nf6 3.g3",
  "1.c4 e6", "1.c4 e6 2.Nf3", "1.c4 e6 2.Nc3",
  "1.c4 c6", "1.c4 c6 2.e4", "1.c4 c6 2.Nf3", "1.c4 c6 2.d4",
  "1.c4 g6", "1.c4 g6 2.d4", "1.c4 f5",
  // A40-A44 Unusual d4 replies
  "1.d4 e6", "1.d4 c5", "1.d4 e6 2.c4", "1.d4 c5 2.d5",
  "1.d4 Nf6 2.c4 c5 3.d5 b5", "1.d4 Nf6 2.c4 c5 3.d5 e6",
  // A45-A49 Indian defenses (misc)
  "1.d4 Nf6", "1.d4 Nf6 2.Bf4", "1.d4 Nf6 2.Nf3", "1.d4 Nf6 2.Nf3 g6",
  "1.d4 Nf6 2.Nf3 e6", "1.d4 Nf6 2.Nf3 d5", "1.d4 Nf6 2.Nf3 d6",
  "1.d4 Nf6 2.c4 e6 3.Nf3", "1.d4 Nf6 2.c4 e6 3.g3",
  // A50-A79 Indian Systems
  // Old Indian
  "1.d4 Nf6 2.c4 d6", "1.d4 Nf6 2.c4 d6 3.Nc3", "1.d4 Nf6 2.c4 d6 3.Nc3 e5",
  // Benoni
  "1.d4 Nf6 2.c4 c5", "1.d4 Nf6 2.c4 c5 3.d5", "1.d4 Nf6 2.c4 c5 3.d5 e6 4.Nc3 exd5 5.cxd5 d6",
  "1.d4 Nf6 2.c4 c5 3.d5 e6 4.Nc3 exd5 5.cxd5 d6 6.e4", "1.d4 Nf6 2.c4 c5 3.d5 e6 4.Nc3 exd5 5.cxd5 d6 6.e4 g6",
  "1.d4 Nf6 2.c4 c5 3.d5 e6 4.Nc3 exd5 5.cxd5 d6 6.Nf3", "1.d4 Nf6 2.c4 c5 3.d5 e6 4.Nc3 exd5 5.cxd5 d6 6.Nf3 g6",
  // Dutch
  "1.d4 f5", "1.d4 f5 2.c4", "1.d4 f5 2.g3", "1.d4 f5 2.c4 Nf6",
  "1.d4 f5 2.c4 Nf6 3.g3", "1.d4 f5 2.c4 Nf6 3.g3 e6", "1.d4 f5 2.c4 Nf6 3.g3 g6",
  "1.d4 f5 2.c4 e6", "1.d4 f5 2.Nf3", "1.d4 f5 2.Nc3",
  // A80-A99 Dutch continued
  "1.d4 f5 2.c4 Nf6 3.Nc3", "1.d4 f5 2.c4 Nf6 3.g3 e6 4.Bg2",
  "1.d4 f5 2.c4 Nf6 3.g3 e6 4.Bg2 Be7", "1.d4 f5 2.c4 Nf6 3.g3 e6 4.Bg2 Be7 5.Nf3 O-O",

  // === B: Semi-Open Games ===
  // B00 Uncommon e4 replies
  "1.e4 d6", "1.e4 b6", "1.e4 Nc6", "1.e4 g6",
  // B01 Scandinavian
  "1.e4 d5", "1.e4 d5 2.exd5", "1.e4 d5 2.exd5 Qxd5", "1.e4 d5 2.exd5 Qxd5 3.Nc3",
  "1.e4 d5 2.exd5 Qxd5 3.Nc3 Qa5", "1.e4 d5 2.exd5 Qxd5 3.Nc3 Qd6",
  "1.e4 d5 2.exd5 Nf6", "1.e4 d5 2.exd5 Nf6 3.d4",
  // B02-B05 Alekhine
  "1.e4 Nf6", "1.e4 Nf6 2.e5", "1.e4 Nf6 2.e5 Nd5", "1.e4 Nf6 2.e5 Nd5 3.d4",
  "1.e4 Nf6 2.e5 Nd5 3.d4 d6", "1.e4 Nf6 2.e5 Nd5 3.c4", "1.e4 Nf6 2.e5 Nd5 3.d4 d6 4.Nf3",
  // B06 Modern/Pirc
  "1.e4 g6 2.d4", "1.e4 g6 2.d4 Bg7", "1.e4 g6 2.d4 Bg7 3.Nc3",
  "1.e4 d6 2.d4", "1.e4 d6 2.d4 Nf6", "1.e4 d6 2.d4 Nf6 3.Nc3",
  "1.e4 d6 2.d4 Nf6 3.Nc3 g6", "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Nf3 Bg7",
  "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.f4",
  // B07-B09 Pirc
  "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Nf3 Bg7 5.Be2",
  "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.f3", "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3",
  // B10-B19 Caro-Kann
  "1.e4 c6", "1.e4 c6 2.d4", "1.e4 c6 2.d4 d5", "1.e4 c6 2.d4 d5 3.Nc3",
  "1.e4 c6 2.d4 d5 3.Nc3 dxe4", "1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4",
  "1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Bf5", "1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nd7",
  "1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nf6", "1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nf6 5.Nxf6+ exf6",
  "1.e4 c6 2.d4 d5 3.e5", "1.e4 c6 2.d4 d5 3.e5 Bf5", "1.e4 c6 2.d4 d5 3.exd5 cxd5",
  "1.e4 c6 2.d4 d5 3.Nd2", "1.e4 c6 2.d4 d5 3.Nd2 dxe4 4.Nxe4",
  "1.e4 c6 2.d4 d5 3.f3", "1.e4 c6 2.Nf3", "1.e4 c6 2.c4",
  // B20-B99 Sicilian
  "1.e4 c5", "1.e4 c5 2.Nf3", "1.e4 c5 2.Nc3", "1.e4 c5 2.c3", "1.e4 c5 2.d4",
  "1.e4 c5 2.f4", "1.e4 c5 2.d3",
  // Sicilian Alapin
  "1.e4 c5 2.c3 d5", "1.e4 c5 2.c3 Nf6", "1.e4 c5 2.c3 d5 3.exd5 Qxd5",
  // Sicilian Open
  "1.e4 c5 2.Nf3 d6", "1.e4 c5 2.Nf3 Nc6", "1.e4 c5 2.Nf3 e6",
  "1.e4 c5 2.Nf3 d6 3.d4", "1.e4 c5 2.Nf3 d6 3.d4 cxd4", "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4",
  "1.e4 c5 2.Nf3 Nc6 3.d4", "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4",
  "1.e4 c5 2.Nf3 e6 3.d4", "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4",
  // Najdorf
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be2",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Bg5",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.f3",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Bc4",
  // Dragon
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6 6.Be3",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6 6.Be3 Bg7 7.f3",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6 6.Be2",
  // Scheveningen
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 e6",
  "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 e6 6.Be2",
  // Sveshnikov
  "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 e5",
  "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 e5 6.Ndb5",
  "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 e5 6.Ndb5 d6",
  // Accelerated Dragon
  "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 g6",
  "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 g6 5.c4",
  // Taimanov
  "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 Nc6",
  "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 Nc6 5.Nc3",
  // Kan
  "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 a6",
  "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 a6 5.Bd3",
  // Grand Prix Attack
  "1.e4 c5 2.Nc3 Nc6 3.f4", "1.e4 c5 2.f4",
  // Closed Sicilian
  "1.e4 c5 2.Nc3 Nc6 3.g3", "1.e4 c5 2.Nc3 Nc6 3.g3 g6 4.Bg2 Bg7",
  // Smith-Morra
  "1.e4 c5 2.d4 cxd4 3.c3",

  // === C: Open Games & French ===
  // C00-C19 French
  "1.e4 e6", "1.e4 e6 2.d4", "1.e4 e6 2.d4 d5",
  "1.e4 e6 2.d4 d5 3.Nc3", "1.e4 e6 2.d4 d5 3.Nd2", "1.e4 e6 2.d4 d5 3.e5",
  "1.e4 e6 2.d4 d5 3.exd5", "1.e4 e6 2.d4 d5 3.exd5 exd5",
  // Winawer
  "1.e4 e6 2.d4 d5 3.Nc3 Bb4", "1.e4 e6 2.d4 d5 3.Nc3 Bb4 4.e5",
  "1.e4 e6 2.d4 d5 3.Nc3 Bb4 4.e5 c5",
  // Classical French
  "1.e4 e6 2.d4 d5 3.Nc3 Nf6", "1.e4 e6 2.d4 d5 3.Nc3 Nf6 4.Bg5",
  "1.e4 e6 2.d4 d5 3.Nc3 Nf6 4.e5",
  // Tarrasch French
  "1.e4 e6 2.d4 d5 3.Nd2 Nf6", "1.e4 e6 2.d4 d5 3.Nd2 c5",
  "1.e4 e6 2.d4 d5 3.Nd2 Nc6", "1.e4 e6 2.d4 d5 3.Nd2 Be7",
  // Advance French
  "1.e4 e6 2.d4 d5 3.e5 c5", "1.e4 e6 2.d4 d5 3.e5 c5 4.c3",
  // C20-C29 Open Game misc
  "1.e4 e5", "1.e4 e5 2.d4", "1.e4 e5 2.Bc4", "1.e4 e5 2.Nc3",
  "1.e4 e5 2.f4", "1.e4 e5 2.d4 exd4", "1.e4 e5 2.d4 exd4 3.Qxd4",
  // Vienna
  "1.e4 e5 2.Nc3 Nf6", "1.e4 e5 2.Nc3 Nc6", "1.e4 e5 2.Nc3 Nf6 3.f4",
  "1.e4 e5 2.Nc3 Nf6 3.Bc4",
  // King's Gambit
  "1.e4 e5 2.f4 exf4", "1.e4 e5 2.f4 exf4 3.Nf3", "1.e4 e5 2.f4 d5",
  "1.e4 e5 2.f4 exf4 3.Nf3 g5", "1.e4 e5 2.f4 exf4 3.Bc4",
  // Bishop's Opening
  "1.e4 e5 2.Bc4 Nf6", "1.e4 e5 2.Bc4 Bc5",
  // C30-C39 King's Gambit (extended)
  "1.e4 e5 2.f4 Bc5", "1.e4 e5 2.f4 exf4 3.Nf3 d6",
  // C40-C49 Open Game with Nf3
  "1.e4 e5 2.Nf3", "1.e4 e5 2.Nf3 d6", "1.e4 e5 2.Nf3 Nf6",
  "1.e4 e5 2.Nf3 Nc6",
  // Philidor
  "1.e4 e5 2.Nf3 d6 3.d4", "1.e4 e5 2.Nf3 d6 3.d4 Nf6",
  // Petrov
  "1.e4 e5 2.Nf3 Nf6 3.Nxe5", "1.e4 e5 2.Nf3 Nf6 3.Nxe5 d6",
  "1.e4 e5 2.Nf3 Nf6 3.Nxe5 d6 4.Nf3 Nxe4", "1.e4 e5 2.Nf3 Nf6 3.d4",
  // Scotch
  "1.e4 e5 2.Nf3 Nc6 3.d4", "1.e4 e5 2.Nf3 Nc6 3.d4 exd4",
  "1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4", "1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Bc4",
  "1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4 Nf6", "1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4 Bc5",
  // Three Knights, Four Knights
  "1.e4 e5 2.Nf3 Nc6 3.Nc3", "1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6",
  "1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6 4.Bb5", "1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6 4.d4",
  // C50-C59 Italian & Two Knights
  "1.e4 e5 2.Nf3 Nc6 3.Bc4", "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5",
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6",
  // Italian (Giuoco Piano)
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3", "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.d3",
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6", "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d4",
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.d3 Nf6", "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.O-O",
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4",
  // Two Knights
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.d4", "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5",
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.d3",
  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5",
  // C60-C99 Ruy Lopez (Spanish)
  "1.e4 e5 2.Nf3 Nc6 3.Bb5",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6", "1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 d6", "1.e4 e5 2.Nf3 Nc6 3.Bb5 f5",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 Bc5", "1.e4 e5 2.Nf3 Nc6 3.Bb5 Nd4",
  // Morphy Defense
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4", "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Nxe4",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O b5",
  // Closed Ruy Lopez
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3 O-O",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 O-O",
  // Marshall Attack
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 O-O 8.c3 d5",
  // Berlin Defense
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.O-O Nxe4",
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.O-O Nxe4 5.d4",
  // Anti-Berlin
  "1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.d3",

  // === D: Closed Games & QGD ===
  "1.d4 d5", "1.d4 d5 2.c4", "1.d4 d5 2.Nf3", "1.d4 d5 2.Bf4",
  // D06-D09 QGD misc
  "1.d4 d5 2.c4 Bf5", "1.d4 d5 2.c4 c5", "1.d4 d5 2.c4 Nc6",
  // D10-D19 Slav
  "1.d4 d5 2.c4 c6", "1.d4 d5 2.c4 c6 3.Nf3", "1.d4 d5 2.c4 c6 3.Nc3",
  "1.d4 d5 2.c4 c6 3.Nf3 Nf6", "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3",
  "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 dxc4", "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 e6",
  "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.e3",
  // Semi-Slav
  "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 e6 5.e3", "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 e6 5.Bg5",
  // D20-D29 QGA
  "1.d4 d5 2.c4 dxc4", "1.d4 d5 2.c4 dxc4 3.Nf3", "1.d4 d5 2.c4 dxc4 3.e4",
  "1.d4 d5 2.c4 dxc4 3.Nf3 Nf6", "1.d4 d5 2.c4 dxc4 3.e3",
  "1.d4 d5 2.c4 dxc4 3.Nf3 Nf6 4.e3",
  // D30-D69 QGD
  "1.d4 d5 2.c4 e6", "1.d4 d5 2.c4 e6 3.Nc3", "1.d4 d5 2.c4 e6 3.Nf3",
  "1.d4 d5 2.c4 e6 3.Nc3 Nf6", "1.d4 d5 2.c4 e6 3.Nc3 Be7",
  "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5", "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Nf3",
  "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.cxd5", "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bf4",
  "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7", "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3",
  "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.Nf3", "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Nbd7",
  "1.d4 d5 2.c4 e6 3.Nf3 Nf6 4.Nc3",
  // Ragozin
  "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Nf3 Bb4",
  // Tartakower
  "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3 O-O 6.Nf3 h6 7.Bh4 b6",
  // D70-D99 Grunfeld
  "1.d4 Nf6 2.c4 g6 3.Nc3 d5", "1.d4 Nf6 2.c4 g6 3.Nc3 d5 4.cxd5 Nxd5",
  "1.d4 Nf6 2.c4 g6 3.Nc3 d5 4.Nf3", "1.d4 Nf6 2.c4 g6 3.Nc3 d5 4.cxd5 Nxd5 5.e4",
  "1.d4 Nf6 2.c4 g6 3.Nc3 d5 4.cxd5 Nxd5 5.e4 Nxc3 6.bxc3",
  "1.d4 Nf6 2.c4 g6 3.Nc3 d5 4.cxd5 Nxd5 5.e4 Nxc3 6.bxc3 Bg7",

  // === E: Indian Defenses ===
  // E00-E09 Catalan
  "1.d4 Nf6 2.c4 e6", "1.d4 Nf6 2.c4 e6 3.g3", "1.d4 Nf6 2.c4 e6 3.g3 d5",
  "1.d4 Nf6 2.c4 e6 3.g3 d5 4.Bg2", "1.d4 Nf6 2.c4 e6 3.g3 d5 4.Nf3",
  "1.d4 Nf6 2.c4 e6 3.g3 d5 4.Bg2 Be7", "1.d4 Nf6 2.c4 e6 3.g3 d5 4.Bg2 Be7 5.Nf3",
  "1.d4 Nf6 2.c4 e6 3.g3 d5 4.Bg2 dxc4",
  // E10-E19 Queen's Indian
  "1.d4 Nf6 2.c4 e6 3.Nf3 b6", "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.g3",
  "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.g3 Bb7", "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.g3 Bb7 5.Bg2",
  "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.a3", "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.Nc3",
  "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.e3",
  // E20-E59 Nimzo-Indian
  "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4", "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3",
  "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.Qc2", "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.Nf3",
  "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.f3", "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.a3",
  "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 O-O", "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 O-O 5.Bd3",
  "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.Qc2 O-O", "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.Qc2 d5",
  "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 c5", "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 b6",
  "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.a3 Bxc3+ 5.bxc3",
  // E60-E99 King's Indian
  "1.d4 Nf6 2.c4 g6", "1.d4 Nf6 2.c4 g6 3.Nc3", "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4", "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.f3",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Be2",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.f4",
  "1.d4 Nf6 2.c4 g6 3.g3", "1.d4 Nf6 2.c4 g6 3.Nf3",
  "1.d4 Nf6 2.c4 g6 3.Nf3 Bg7 4.g3",
  // Classical KID
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2 e5",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2 e5 7.O-O",
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2 e5 7.O-O Nc6",
  // Samisch KID
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.f3 O-O 6.Be3",
  // Four Pawns Attack
  "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.f4 O-O 6.Nf3",
  // Fianchetto KID
  "1.d4 Nf6 2.c4 g6 3.Nf3 Bg7 4.g3 O-O 5.Bg2",
  "1.d4 Nf6 2.c4 g6 3.g3 Bg7 4.Bg2 O-O 5.Nc3 d6 6.Nf3",

  // === London System ===
  "1.d4 d5 2.Bf4", "1.d4 Nf6 2.Bf4", "1.d4 d5 2.Bf4 Nf6",
  "1.d4 d5 2.Bf4 Nf6 3.e3", "1.d4 d5 2.Bf4 Nf6 3.Nf3",
  "1.d4 Nf6 2.Bf4 d5 3.e3 c5", "1.d4 Nf6 2.Bf4 d5 3.e3 e6",
  "1.d4 d5 2.Nf3 Nf6 3.Bf4", "1.d4 Nf6 2.Nf3 d5 3.Bf4",
  "1.d4 Nf6 2.Nf3 e6 3.Bf4", "1.d4 Nf6 2.Nf3 g6 3.Bf4",

  // === Trompowsky ===
  "1.d4 Nf6 2.Bg5", "1.d4 Nf6 2.Bg5 Ne4", "1.d4 Nf6 2.Bg5 e6",
  "1.d4 Nf6 2.Bg5 d5",

  // === Miscellaneous popular lines ===
  // King's Indian Attack
  "1.Nf3 d5 2.g3", "1.Nf3 d5 2.g3 Nf6 3.Bg2", "1.e4 e6 2.d3",
  "1.e4 e6 2.d3 d5 3.Nd2 Nf6 4.Ngf3",
  // Torre Attack
  "1.d4 Nf6 2.Nf3 e6 3.Bg5", "1.d4 Nf6 2.Nf3 g6 3.Bg5",
  // Colle System
  "1.d4 d5 2.Nf3 Nf6 3.e3", "1.d4 d5 2.Nf3 Nf6 3.e3 e6 4.Bd3",
  // Stonewall
  "1.d4 d5 2.e3 Nf6 3.Bd3 e6 4.f4",
];

let bookFens: Set<string> | null = null;
let bookPrefixes: Set<string> | null = null;

function stripFenCounters(fen: string): string {
  const parts = fen.split(" ");
  return parts.slice(0, 4).join(" ");
}

function buildBook(): void {
  bookFens = new Set<string>();
  bookPrefixes = new Set<string>();

  for (const line of OPENING_LINES) {
    try {
      const chess = new Chess();
      const moves = parseMoveText(line);
      const sanList: string[] = [];

      for (const san of moves) {
        const result = chess.move(san);
        if (!result) break;
        sanList.push(result.san);
        const key = stripFenCounters(chess.fen());
        bookFens.add(key);
        bookPrefixes.add(sanList.join(" "));
      }
    } catch {
    }
  }
}

function parseMoveText(text: string): string[] {
  return text
    .replace(/\d+\.\.\./g, "")
    .replace(/\d+\./g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function isBookPosition(fen: string): boolean {
  if (!bookFens) buildBook();
  return bookFens!.has(stripFenCounters(fen));
}

export function isBookMoveSequence(sans: string[]): boolean {
  if (!bookPrefixes) buildBook();
  return bookPrefixes!.has(sans.join(" "));
}

export function initOpeningBook(): void {
  buildBook();
}
