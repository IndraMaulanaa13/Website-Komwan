(function initDeckUtils(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BasikalDeckUtils = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDeckUtils() {
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RED_SUITS = new Set(["♥", "♦"]);
  const RANKS = [
    { name: "A", value: 1 },
    { name: "2", value: 2 },
    { name: "3", value: 3 },
    { name: "4", value: 4 },
    { name: "5", value: 5 },
    { name: "6", value: 6 },
    { name: "7", value: 7 },
    { name: "8", value: 8 },
    { name: "9", value: 9 },
    { name: "10", value: 10 },
    { name: "J", value: 11 },
    { name: "Q", value: 12 },
    { name: "K", value: 13 },
  ];

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank: rank.name, value: rank.value, suit, isRed: RED_SUITS.has(suit) });
      }
    }
    return shuffle(deck);
  }

  function drawCard(deck) {
    if (deck.length === 0) {
      deck.push(...buildDeck());
    }
    return deck.pop();
  }

  function dealHands(deck, numPlayers, dealCount) {
    const copy = deck.slice();
    const hands = [];
    for (let i = 0; i < numPlayers; i++) {
      hands.push(copy.splice(0, dealCount));
    }
    return { hands, pile: copy };
  }

  function drawForSuit(pile, suit) {
    const drawn = [];
    while (pile.length > 0) {
      const card = pile.pop();
      if (card.suit === suit) {
        return { drawn, matched: card };
      }
      drawn.push(card);
    }
    return { drawn, matched: null };
  }

  function rankValue(card) {
    return card.value;
  }

  function applyHandLuck(hand, pile, luck) {
    if (!hand || !pile || hand.length === 0 || pile.length === 0) return;
    if (luck === 0.5) return;

    const swaps = Math.round(Math.abs(luck - 0.5) * 2 * hand.length);

    if (luck > 0.5) {
      for (let i = 0; i < swaps; i++) {
        let handLowIdx = 0;
        for (let j = 1; j < hand.length; j++) {
          if (hand[j].value < hand[handLowIdx].value) handLowIdx = j;
        }
        let pileHighIdx = 0;
        for (let j = 1; j < pile.length; j++) {
          if (pile[j].value > pile[pileHighIdx].value) pileHighIdx = j;
        }
        if (pile[pileHighIdx].value > hand[handLowIdx].value) {
          [hand[handLowIdx], pile[pileHighIdx]] = [pile[pileHighIdx], hand[handLowIdx]];
        } else {
          break;
        }
      }

      if (luck >= 0.7) {
        const hasSevenDiamonds = hand.some(c => c.rank === "7" && c.suit === "♦");
        if (!hasSevenDiamonds) {
          const pile7DIdx = pile.findIndex(c => c.rank === "7" && c.suit === "♦");
          if (pile7DIdx !== -1) {
            let handLowIdx = 0;
            for (let j = 1; j < hand.length; j++) {
              if (hand[j].value < hand[handLowIdx].value) handLowIdx = j;
            }
            [hand[handLowIdx], pile[pile7DIdx]] = [pile[pile7DIdx], hand[handLowIdx]];
          }
        }
      }
    } else {
      for (let i = 0; i < swaps; i++) {
        let handHighIdx = 0;
        for (let j = 1; j < hand.length; j++) {
          if (hand[j].value > hand[handHighIdx].value) handHighIdx = j;
        }
        let pileLowIdx = 0;
        for (let j = 1; j < pile.length; j++) {
          if (pile[j].value < pile[pileLowIdx].value) pileLowIdx = j;
        }
        if (pile[pileLowIdx].value < hand[handHighIdx].value) {
          [hand[handHighIdx], pile[pileLowIdx]] = [pile[pileLowIdx], hand[handHighIdx]];
        } else {
          break;
        }
      }
    }
  }

  function drawForSuitBiased(pile, suit, luck) {
    if (luck === 0.5 || pile.length === 0) {
      return drawForSuit(pile, suit);
    }

    const p = Math.abs(luck - 0.5) * 2;

    if (Math.random() < p) {
      if (luck > 0.5) {
        const idx = pile.findIndex(c => c.suit === suit);
        if (idx !== -1) {
          const card = pile.splice(idx, 1)[0];
          pile.push(card);
        }
      } else {
        const suited = [];
        const nonSuited = [];
        for (const card of pile) {
          if (card.suit === suit) suited.push(card);
          else nonSuited.push(card);
        }
        pile.length = 0;
        pile.push(...suited, ...nonSuited);
      }
    }

    return drawForSuit(pile, suit);
  }

  return {
    SUITS,
    RED_SUITS,
    RANKS,
    shuffle,
    buildDeck,
    drawCard,
    dealHands,
    drawForSuit,
    rankValue,
    applyHandLuck,
    drawForSuitBiased,
  };
});
