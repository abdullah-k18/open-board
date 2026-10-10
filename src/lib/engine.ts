import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type EngineMove = {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
};

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const KNIGHT_SQUARE = [
  -20, -10, -8, -8, -8, -8, -10, -20, -10, 0, 2, 4, 4, 2, 0, -10, -8, 2, 10,
  14, 14, 10, 2, -8, -8, 6, 14, 18, 18, 14, 6, -8, -8, 6, 14, 18, 18, 14, 6,
  -8, -8, 2, 10, 14, 14, 10, 2, -8, -10, 0, 2, 4, 4, 2, 0, -10, -20, -10, -8,
  -8, -8, -8, -10, -20,
];

function mirrorIndex(index: number): number {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return (7 - rank) * 8 + file;
}

function evaluateWhite(chess: Chess): number {
  let score = 0;
  const pawns = { w: [0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0] };
  let whiteBishops = 0;
  let blackBishops = 0;

  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece) continue;
      const sign = piece.color === "w" ? 1 : -1;
      const file = piece.square.charCodeAt(0) - 97;
      const boardRank = Number(piece.square[1]);
      const whiteIndex = (boardRank - 1) * 8 + file;
      const tableIndex = piece.color === "w" ? whiteIndex : mirrorIndex(whiteIndex);
      let value = PIECE_VALUE[piece.type];

      if (piece.type === "p") {
        const advanced = piece.color === "w" ? boardRank - 1 : 8 - boardRank;
        let bonus = [0, 0, 6, 14, 24, 40, 64, 0][advanced] ?? 0;
        if (file === 0 || file === 7) bonus -= 14 * advanced;
        if (file === 3 || file === 4) bonus += 10 * Math.max(advanced - 1, 0);
        value += bonus;
        pawns[piece.color][file] += 1;
      } else if (piece.type === "n") {
        value += KNIGHT_SQUARE[tableIndex] ?? 0;
      } else if (piece.type === "b") {
        value += Math.round((KNIGHT_SQUARE[tableIndex] ?? 0) * 0.6);
        if (piece.color === "w") whiteBishops += 1;
        else blackBishops += 1;
      } else if (piece.type === "k") {
        const centerDist =
          Math.abs(file - 3.5) + Math.abs(boardRank - (piece.color === "w" ? 1 : 8));
        value -= centerDist * 6;
      }

      score += sign * value;
    }
  }

  for (let file = 0; file < 8; file += 1) {
    if (pawns.w[file] > 1) score -= 14 * (pawns.w[file] - 1);
    if (pawns.b[file] > 1) score += 14 * (pawns.b[file] - 1);
  }
  if (whiteBishops >= 2) score += 20;
  if (blackBishops >= 2) score -= 20;

  return score;
}

function attacksWorthNoting(chess: Chess, from: Square, color: Color): number {
  const enemy = color === "w" ? "b" : "w";
  let bonus = 0;
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece || piece.color !== enemy || piece.type === "p" || piece.type === "k") continue;
      if (chess.attackers(piece.square, color).includes(from)) {
        bonus += piece.type === "q" ? 30 : 8;
      }
    }
  }
  return bonus;
}

function opponentCanMate(chess: Chess): boolean {
  for (const reply of chess.moves({ verbose: true })) {
    chess.move({ from: reply.from, to: reply.to, promotion: reply.promotion });
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return true;
  }
  return false;
}

function leavesPieceLoose(chess: Chess, square: Square): number {
  const enemy = chess.turn();
  if (!chess.isAttacked(square, enemy)) return 0;
  const piece = chess.get(square);
  if (!piece || piece.type === "k") return 0;

  let cheapest = Number.POSITIVE_INFINITY;
  for (const from of chess.attackers(square, enemy)) {
    const attacker = chess.get(from);
    if (attacker) cheapest = Math.min(cheapest, PIECE_VALUE[attacker.type] || 100);
  }

  const friends = enemy === "w" ? "b" : "w";
  const defended = chess.attackers(square, friends).length > 0;
  if (cheapest < PIECE_VALUE[piece.type]) return PIECE_VALUE[piece.type] - cheapest;
  if (!defended) return PIECE_VALUE[piece.type];
  return 0;
}

export function chooseMove(fen: string): EngineMove | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  const mover = chess.turn();
  const ranked: { move: Move; score: number }[] = [];

  for (const candidate of moves) {
    chess.move({
      from: candidate.from,
      to: candidate.to,
      promotion: candidate.promotion,
    });

    let score: number;
    if (chess.isCheckmate()) {
      score = 100000;
    } else if (chess.isDraw()) {
      score = -200;
    } else {
      score = evaluateWhite(chess);
      if (mover === "b") score = -score;
      score -= leavesPieceLoose(chess, candidate.to);
      score += attacksWorthNoting(chess, candidate.to, mover);
      if (opponentCanMate(chess)) score -= 90000;
      if (candidate.piece === "q" && !candidate.isCapture() && chess.moveNumber() < 7) score -= 40;
      if (candidate.isKingsideCastle() || candidate.isQueensideCastle()) score += 70;
      if (candidate.promotion === "q") score += 40;
    }

    chess.undo();
    ranked.push({ move: candidate, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? 0;
  const close = ranked.filter((entry) => best - entry.score <= 8);
  const pick = close[Math.floor(Math.random() * close.length)] ?? ranked[0];
  if (!pick) return null;

  return {
    from: pick.move.from,
    to: pick.move.to,
    promotion: pick.move.promotion,
  };
}
