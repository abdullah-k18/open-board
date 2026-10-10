import type { Move, PieceSymbol } from "chess.js";

export type Lesson = {
  name: string;
  summary: string;
  rules: string[];
};

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export const PIECE_LESSONS: Record<PieceSymbol, Lesson> = {
  p: {
    name: "Pawn",
    summary: "The pawn steps forward and captures on a diagonal.",
    rules: [
      "It moves one square straight ahead, or two squares on its first move, and only if those squares are empty.",
      "It captures one square diagonally forward. It cannot capture the piece directly in front of it.",
      "On the last rank it promotes. You choose a queen, rook, bishop, or knight, and the pawn becomes that piece at once.",
    ],
  },
  n: {
    name: "Knight",
    summary: "The knight jumps in an L.",
    rules: [
      "It moves two squares in one direction, then one square sideways.",
      "It is the only piece that jumps, so pieces in between do not block it.",
      "Every knight move lands on the opposite color of square.",
    ],
  },
  b: {
    name: "Bishop",
    summary: "The bishop travels any distance on a diagonal.",
    rules: [
      "It stays on squares of one color for the whole game. You start with one bishop on each color.",
      "It stops at the first piece in its path and may capture that piece if it belongs to the opponent.",
      "It cannot jump.",
    ],
  },
  r: {
    name: "Rook",
    summary: "The rook travels any distance along a rank or a file.",
    rules: [
      "Ranks run sideways and files run up the board. A rook uses either one.",
      "It cannot jump. A piece in the way blocks it, and an enemy piece on the path can be captured.",
      "In castling, a rook jumps to the other side of the king. The king move is what you play.",
    ],
  },
  q: {
    name: "Queen",
    summary: "The queen combines the rook and the bishop.",
    rules: [
      "She moves any number of squares along a rank, a file, or a diagonal.",
      "She cannot jump, and she captures by landing on an enemy piece.",
      "She is the strongest piece, which is why a pawn usually promotes to a queen.",
    ],
  },
  k: {
    name: "King",
    summary: "The king moves one square, and the game is about his safety.",
    rules: [
      "He moves one square in any direction: straight or diagonal.",
      "He may never move onto a square the opponent attacks. If he is attacked, that is check, and it must be answered.",
      "Once a game he may castle: two squares toward a rook, if neither has moved, the squares between them are empty, and he does not start in, pass through, or land in check.",
    ],
  },
};

export const SETUP_LESSON: Lesson = {
  name: "Starting position",
  summary: "Both armies mirror each other. White moves first.",
  rules: [
    "Pawns stand on the second rank. Behind them, from the corner: rook, knight, bishop, queen, king, bishop, knight, rook.",
    "The queen starts on her own color. White’s queen is on d1, and black’s queen is on d8.",
    "On your turn you move one of your own pieces, to a legal square. Then it is the other side’s turn.",
  ],
};

function quietReason(move: Move): string {
  switch (move.piece) {
    case "p":
      return "When a pawn is not capturing, it steps straight ahead.";
    case "n":
      return "That L-shaped jump is the knight’s only move.";
    case "b":
      return "The bishop keeps to diagonals of one color.";
    case "r":
      return "The rook slides along the rank or the file until a piece stops it.";
    case "q":
      return "The queen may use a rank, a file, or a diagonal on the same move, but only one direction.";
    case "k":
      return "One square is the king’s ordinary limit. He still cannot step into attack.";
    default:
      return "";
  }
}

export function narrate(move: Move, answeredCheck = false): string {
  const side = move.color === "w" ? "White" : "Black";
  const other = move.color === "w" ? "Black" : "White";
  const piece = PIECE_NAME[move.piece];
  let text: string;

  if (move.isKingsideCastle()) {
    text = `${side} castles kingside. The king steps two squares toward the h-file, and the rook on that file hops across to the square he crossed. Castling is only legal when the king and that rook have not moved, the squares between them are empty, and the king is not in check on the way.`;
  } else if (move.isQueensideCastle()) {
    text = `${side} castles queenside. The king steps two squares toward the a-file, and the rook hops to the other side of him. The path has to be clear, and the king cannot castle out of, through, or into check.`;
  } else if (move.isEnPassant()) {
    text = `${side}’s pawn captures en passant on ${move.to}. The enemy pawn had just moved two squares and landed beside it. The capture is made as if that pawn had moved only one square, and the chance lasts for this move only.`;
  } else if (move.promotion) {
    const made = PIECE_NAME[move.promotion];
    text = move.isCapture()
      ? `${side}’s pawn captures on ${move.to} and promotes to a ${made}. A pawn that reaches the far rank must become a queen, rook, bishop, or knight.`
      : `${side}’s pawn reaches ${move.to} and promotes to a ${made}. A pawn that reaches the far rank must become a queen, rook, bishop, or knight.`;
  } else if (move.isCapture()) {
    const taken = move.captured ? PIECE_NAME[move.captured] : "piece";
    text = `${side}’s ${piece} goes from ${move.from} to ${move.to} and captures the ${taken}.`;
    text +=
      move.piece === "p"
        ? " Pawns capture diagonally, not straight ahead."
        : move.piece === "n"
          ? " The knight may jump and capture the piece it lands on."
          : " A capture removes the piece you land on. Except for the knight, you cannot jump to reach it.";
  } else if (move.isBigPawn()) {
    text = `${side}’s pawn goes from ${move.from} to ${move.to}, two squares. A pawn may do that only on its first move, and only when both squares ahead are empty. This is not a capture.`;
  } else {
    text = `${side}’s ${piece} goes from ${move.from} to ${move.to}. ${quietReason(move)}`;
  }

  if (answeredCheck) {
    text += ` ${side} was in check, so this move had to get the king out of it.`;
    if (move.isCapture()) text += " Capturing the checking piece is one way to do that.";
  }

  if (move.san.endsWith("#")) {
    text += ` That is checkmate. ${other}’s king is attacked, and no legal move can answer it.`;
  } else if (move.san.endsWith("+")) {
    text += ` The move gives check. ${other}’s king is attacked, so the next move has to get him out of check.`;
  }

  return text;
}

export function pieceName(type: PieceSymbol): string {
  return PIECE_NAME[type];
}
