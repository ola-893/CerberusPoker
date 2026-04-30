/// On-chain hand evaluator for Texas Hold'em.
///
/// Cards 0-51: suit = card / 13, rank = card % 13
/// Ranks: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
/// Suits: 0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades
///
/// Full implementation in task 14.
///
/// ## Compute Unit Performance (Task 14.5)
///
/// Verified to fit comfortably within Solana compute unit limits:
/// - Estimated CU per hand: ~1,500 CU
/// - Estimated CU for 6-player showdown: ~9,000 CU
/// - Usage: 4.5% of default 200,000 CU limit
/// - Safety margin: 22x for 6-player showdowns
///
/// See `COMPUTE_UNIT_ANALYSIS.md` and `tests/compute_unit_benchmark.rs` for details.

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum HandRank {
    HighCard = 0,
    Pair = 1,
    TwoPair = 2,
    ThreeOfAKind = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    FourOfAKind = 7,
    StraightFlush = 8,
    RoyalFlush = 9,
}

/// Tiebreaker value that encodes multiple kicker cards for comparison.
/// Stores up to 5 card ranks in descending order of importance.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Tiebreaker {
    pub values: [u8; 5],
}

impl Tiebreaker {
    pub fn new(values: &[u8]) -> Self {
        let mut arr = [0u8; 5];
        for (i, &v) in values.iter().enumerate().take(5) {
            arr[i] = v;
        }
        Self { values: arr }
    }
}

impl PartialOrd for Tiebreaker {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Tiebreaker {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        for i in 0..5 {
            match self.values[i].cmp(&other.values[i]) {
                std::cmp::Ordering::Equal => continue,
                other => return other,
            }
        }
        std::cmp::Ordering::Equal
    }
}

/// Evaluate the best 5-card hand from 7 cards.
/// Returns (HandRank, Tiebreaker).
/// 
/// The tiebreaker encodes multiple card ranks for proper comparison:
/// - High Card: all 5 cards in descending order
/// - One Pair: pair rank, then 3 kickers in descending order
/// - Two Pair: higher pair, lower pair, then 1 kicker
/// - Three of a Kind: trips rank, then 2 kickers in descending order
/// - Straight: high card of the straight
/// - Flush: all 5 cards in descending order
/// - Full House: trips rank, then pair rank
/// - Four of a Kind: quads rank, then 1 kicker
/// - Straight Flush: high card of the straight flush
/// - Royal Flush: no kickers needed (all tie)
pub fn evaluate_hand(cards: &[u8; 7]) -> (HandRank, Tiebreaker) {
    let mut ranks = [0u8; 7];
    let mut suits = [0u8; 7];
    
    for i in 0..7 {
        ranks[i] = card_rank(cards[i]);
        suits[i] = card_suit(cards[i]);
    }
    
    // Count rank frequencies
    let mut rank_counts = [0u8; 13];
    for &rank in &ranks {
        rank_counts[rank as usize] += 1;
    }
    
    // Check for flush (5+ cards of same suit)
    let flush_suit = find_flush(&suits);
    let has_flush = flush_suit.is_some();
    
    // Check for straight
    let straight_high = find_straight(&ranks);
    let has_straight = straight_high.is_some();
    
    // If both flush and straight, check for straight flush
    if has_flush && has_straight {
        let flush_suit = flush_suit.unwrap();
        let flush_ranks: Vec<u8> = ranks.iter()
            .zip(suits.iter())
            .filter(|(_, &s)| s == flush_suit)
            .map(|(&r, _)| r)
            .collect();
        
        if let Some(sf_high) = find_straight(&flush_ranks) {
            // Royal flush is a straight flush with ace high (rank 12)
            if sf_high == 12 {
                return (HandRank::RoyalFlush, Tiebreaker::new(&[12]));
            }
            return (HandRank::StraightFlush, Tiebreaker::new(&[sf_high]));
        }
    }
    
    // Check for four of a kind
    for rank in (0..13).rev() {
        if rank_counts[rank] == 4 {
            // Find the kicker (highest card that's not part of the quads)
            let kicker = get_kickers(&ranks, &[rank as u8], 1);
            return (HandRank::FourOfAKind, Tiebreaker::new(&[rank as u8, kicker[0]]));
        }
    }
    
    // Check for full house (three of a kind + pair)
    let mut three_rank = None;
    let mut pair_rank = None;
    
    for rank in (0..13).rev() {
        if rank_counts[rank] == 3 && three_rank.is_none() {
            three_rank = Some(rank as u8);
        } else if rank_counts[rank] >= 2 && pair_rank.is_none() && three_rank.is_some() {
            pair_rank = Some(rank as u8);
        }
    }
    
    if let (Some(three), Some(pair)) = (three_rank, pair_rank) {
        return (HandRank::FullHouse, Tiebreaker::new(&[three, pair]));
    }
    
    // Check for flush
    if has_flush {
        let flush_suit = flush_suit.unwrap();
        let mut flush_ranks: Vec<u8> = ranks.iter()
            .zip(suits.iter())
            .filter(|(_, &s)| s == flush_suit)
            .map(|(&r, _)| r)
            .collect();
        flush_ranks.sort_by(|a, b| b.cmp(a)); // Sort descending
        // Take top 5 cards for the flush
        return (HandRank::Flush, Tiebreaker::new(&flush_ranks[..5]));
    }
    
    // Check for straight
    if has_straight {
        return (HandRank::Straight, Tiebreaker::new(&[straight_high.unwrap()]));
    }
    
    // Check for three of a kind
    for rank in (0..13).rev() {
        if rank_counts[rank] == 3 {
            // Find 2 kickers
            let kickers = get_kickers(&ranks, &[rank as u8], 2);
            return (HandRank::ThreeOfAKind, Tiebreaker::new(&[rank as u8, kickers[0], kickers[1]]));
        }
    }
    
    // Check for two pair
    let mut pairs = Vec::new();
    for rank in (0..13).rev() {
        if rank_counts[rank] == 2 {
            pairs.push(rank as u8);
        }
    }
    
    if pairs.len() >= 2 {
        // Find 1 kicker - exclude ALL pairs, not just the top 2
        let kicker = get_kickers(&ranks, &pairs, 1);
        return (HandRank::TwoPair, Tiebreaker::new(&[pairs[0], pairs[1], kicker[0]]));
    }
    
    // Check for one pair
    if pairs.len() == 1 {
        // Find 3 kickers
        let kickers = get_kickers(&ranks, &[pairs[0]], 3);
        return (HandRank::Pair, Tiebreaker::new(&[pairs[0], kickers[0], kickers[1], kickers[2]]));
    }
    
    // High card - all 5 cards in descending order
    let mut sorted_ranks = ranks;
    sorted_ranks.sort_by(|a, b| b.cmp(a));
    (HandRank::HighCard, Tiebreaker::new(&sorted_ranks[..5]))
}

/// Find if there's a flush (5+ cards of same suit).
/// Returns the suit if found.
fn find_flush(suits: &[u8]) -> Option<u8> {
    let mut suit_counts = [0u8; 4];
    for &suit in suits {
        suit_counts[suit as usize] += 1;
        if suit_counts[suit as usize] >= 5 {
            return Some(suit);
        }
    }
    None
}

/// Get kicker cards (cards not in the excluded ranks), sorted descending.
/// Returns up to `count` kickers.
fn get_kickers(ranks: &[u8], exclude: &[u8], count: usize) -> Vec<u8> {
    let mut kickers: Vec<u8> = ranks.iter()
        .filter(|&&r| !exclude.contains(&r))
        .copied()
        .collect();
    kickers.sort_by(|a, b| b.cmp(a)); // Sort descending
    kickers.dedup(); // Remove duplicates
    kickers.truncate(count);
    
    // Pad with zeros if we don't have enough kickers
    while kickers.len() < count {
        kickers.push(0);
    }
    
    kickers
}

/// Find the highest straight in the given ranks.
/// Returns the high card of the straight if found.
/// Handles ace-low straight (A-2-3-4-5).
fn find_straight(ranks: &[u8]) -> Option<u8> {
    // Create a bitmask of which ranks are present
    let mut rank_mask = 0u16;
    for &rank in ranks {
        rank_mask |= 1 << rank;
    }
    
    // Check for regular straights (high to low)
    // Straight patterns: 5 consecutive bits set
    for high in (4..=12).rev() {
        let pattern = 0b11111 << (high - 4);
        if (rank_mask & pattern) == pattern {
            return Some(high);
        }
    }
    
    // Check for ace-low straight (A-2-3-4-5)
    // Ace is rank 12, so we need ranks 0,1,2,3,12
    let ace_low_pattern = 0b1000000001111; // bits 0,1,2,3,12
    if (rank_mask & ace_low_pattern) == ace_low_pattern {
        return Some(3); // In ace-low straight, the high card is the 5 (rank 3)
    }
    
    None
}

pub fn card_rank(card: u8) -> u8 {
    card % 13
}

pub fn card_suit(card: u8) -> u8 {
    card / 13
}

#[cfg(test)]
mod tests {
    use super::*;

    // Helper to create a card from rank and suit
    fn make_card(rank: u8, suit: u8) -> u8 {
        suit * 13 + rank
    }

    #[test]
    fn test_card_encoding() {
        // Test card encoding: suit = card/13, rank = card%13
        assert_eq!(card_rank(0), 0); // 2 of clubs
        assert_eq!(card_suit(0), 0);
        
        assert_eq!(card_rank(12), 12); // Ace of clubs
        assert_eq!(card_suit(12), 0);
        
        assert_eq!(card_rank(13), 0); // 2 of diamonds
        assert_eq!(card_suit(13), 1);
        
        assert_eq!(card_rank(51), 12); // Ace of spades
        assert_eq!(card_suit(51), 3);
    }

    #[test]
    fn test_royal_flush() {
        // Royal flush in hearts: 10-J-Q-K-A (ranks 8,9,10,11,12, suit 2)
        let cards = [
            make_card(8, 2),  // 10♥
            make_card(9, 2),  // J♥
            make_card(10, 2), // Q♥
            make_card(11, 2), // K♥
            make_card(12, 2), // A♥
            make_card(0, 0),  // 2♣ (noise)
            make_card(1, 1),  // 3♦ (noise)
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::RoyalFlush);
        assert_eq!(tiebreaker.values[0], 12); // Ace high
    }

    #[test]
    fn test_straight_flush() {
        // Straight flush: 5-6-7-8-9 of spades (ranks 3,4,5,6,7, suit 3)
        let cards = [
            make_card(3, 3),  // 5♠
            make_card(4, 3),  // 6♠
            make_card(5, 3),  // 7♠
            make_card(6, 3),  // 8♠
            make_card(7, 3),  // 9♠
            make_card(0, 0),  // 2♣
            make_card(1, 1),  // 3♦
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::StraightFlush);
        assert_eq!(tiebreaker.values[0], 7); // 9 high
    }

    #[test]
    fn test_straight_flush_ace_low() {
        // Ace-low straight flush: A-2-3-4-5 of clubs (ranks 12,0,1,2,3, suit 0)
        let cards = [
            make_card(12, 0), // A♣
            make_card(0, 0),  // 2♣
            make_card(1, 0),  // 3♣
            make_card(2, 0),  // 4♣
            make_card(3, 0),  // 5♣
            make_card(8, 1),  // 10♦
            make_card(9, 2),  // J♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::StraightFlush);
        assert_eq!(tiebreaker.values[0], 3); // 5 high (ace-low)
    }

    #[test]
    fn test_four_of_a_kind() {
        // Four kings (rank 11)
        let cards = [
            make_card(11, 0), // K♣
            make_card(11, 1), // K♦
            make_card(11, 2), // K♥
            make_card(11, 3), // K♠
            make_card(5, 0),  // 7♣
            make_card(6, 1),  // 8♦
            make_card(7, 2),  // 9♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::FourOfAKind);
        assert_eq!(tiebreaker.values[0], 11); // Kings
        assert_eq!(tiebreaker.values[1], 7);  // 9 kicker
    }

    #[test]
    fn test_full_house() {
        // Three 8s and two 5s (ranks 6 and 3)
        let cards = [
            make_card(6, 0),  // 8♣
            make_card(6, 1),  // 8♦
            make_card(6, 2),  // 8♥
            make_card(3, 0),  // 5♣
            make_card(3, 1),  // 5♦
            make_card(0, 2),  // 2♥
            make_card(1, 3),  // 3♠
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::FullHouse);
        assert_eq!(tiebreaker.values[0], 6); // Three 8s
        assert_eq!(tiebreaker.values[1], 3); // Two 5s
    }

    #[test]
    fn test_flush() {
        // Five hearts (not a straight)
        let cards = [
            make_card(0, 2),  // 2♥
            make_card(3, 2),  // 5♥
            make_card(5, 2),  // 7♥
            make_card(8, 2),  // 10♥
            make_card(12, 2), // A♥
            make_card(1, 0),  // 3♣
            make_card(2, 1),  // 4♦
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::Flush);
        assert_eq!(tiebreaker.values[0], 12); // Ace high
        assert_eq!(tiebreaker.values[1], 8);  // 10
        assert_eq!(tiebreaker.values[2], 5);  // 7
        assert_eq!(tiebreaker.values[3], 3);  // 5
        assert_eq!(tiebreaker.values[4], 0);  // 2
    }

    #[test]
    fn test_straight() {
        // Straight: 6-7-8-9-10 (ranks 4,5,6,7,8) mixed suits
        let cards = [
            make_card(4, 0),  // 6♣
            make_card(5, 1),  // 7♦
            make_card(6, 2),  // 8♥
            make_card(7, 3),  // 9♠
            make_card(8, 0),  // 10♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::Straight);
        assert_eq!(tiebreaker.values[0], 8); // 10 high
    }

    #[test]
    fn test_straight_ace_low() {
        // Ace-low straight: A-2-3-4-5 mixed suits
        let cards = [
            make_card(12, 0), // A♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
            make_card(2, 3),  // 4♠
            make_card(3, 0),  // 5♣
            make_card(8, 1),  // 10♦
            make_card(9, 2),  // J♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::Straight);
        assert_eq!(tiebreaker.values[0], 3); // 5 high (ace-low)
    }

    #[test]
    fn test_straight_ace_high() {
        // Ace-high straight: 10-J-Q-K-A mixed suits
        let cards = [
            make_card(8, 0),  // 10♣
            make_card(9, 1),  // J♦
            make_card(10, 2), // Q♥
            make_card(11, 3), // K♠
            make_card(12, 0), // A♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::Straight);
        assert_eq!(tiebreaker.values[0], 12); // Ace high
    }

    #[test]
    fn test_three_of_a_kind() {
        // Three 7s (rank 5)
        let cards = [
            make_card(5, 0),  // 7♣
            make_card(5, 1),  // 7♦
            make_card(5, 2),  // 7♥
            make_card(0, 0),  // 2♣
            make_card(3, 1),  // 5♦
            make_card(8, 2),  // 10♥
            make_card(11, 3), // K♠
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::ThreeOfAKind);
        assert_eq!(tiebreaker.values[0], 5);  // Three 7s
        assert_eq!(tiebreaker.values[1], 11); // K kicker
        assert_eq!(tiebreaker.values[2], 8);  // 10 kicker
    }

    #[test]
    fn test_two_pair() {
        // Two jacks and two 4s (ranks 9 and 2)
        let cards = [
            make_card(9, 0),  // J♣
            make_card(9, 1),  // J♦
            make_card(2, 2),  // 4♥
            make_card(2, 3),  // 4♠
            make_card(0, 0),  // 2♣
            make_card(5, 1),  // 7♦
            make_card(8, 2),  // 10♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::TwoPair);
        assert_eq!(tiebreaker.values[0], 9); // Higher pair (jacks)
        assert_eq!(tiebreaker.values[1], 2); // Lower pair (4s)
        assert_eq!(tiebreaker.values[2], 8); // 10 kicker
    }

    #[test]
    fn test_one_pair() {
        // One pair of 9s (rank 7)
        let cards = [
            make_card(7, 0),  // 9♣
            make_card(7, 1),  // 9♦
            make_card(0, 2),  // 2♥
            make_card(3, 3),  // 5♠
            make_card(5, 0),  // 7♣
            make_card(8, 1),  // 10♦
            make_card(11, 2), // K♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::Pair);
        assert_eq!(tiebreaker.values[0], 7);  // Pair of 9s
        assert_eq!(tiebreaker.values[1], 11); // K kicker
        assert_eq!(tiebreaker.values[2], 8);  // 10 kicker
        assert_eq!(tiebreaker.values[3], 5);  // 7 kicker
    }

    #[test]
    fn test_high_card() {
        // No pairs, no flush, no straight
        let cards = [
            make_card(0, 0),  // 2♣
            make_card(3, 1),  // 5♦
            make_card(5, 2),  // 7♥
            make_card(8, 3),  // 10♠
            make_card(9, 0),  // J♣
            make_card(11, 1), // K♦
            make_card(12, 2), // A♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::HighCard);
        assert_eq!(tiebreaker.values[0], 12); // Ace high
        assert_eq!(tiebreaker.values[1], 11); // K
        assert_eq!(tiebreaker.values[2], 9);  // J
        assert_eq!(tiebreaker.values[3], 8);  // 10
        assert_eq!(tiebreaker.values[4], 5);  // 7
    }

    #[test]
    fn test_flush_over_straight() {
        // When both flush and straight exist but not together
        // Should prioritize flush
        let cards = [
            make_card(0, 2),  // 2♥
            make_card(4, 2),  // 6♥
            make_card(6, 2),  // 8♥
            make_card(8, 2),  // 10♥
            make_card(12, 2), // A♥ (flush)
            make_card(5, 0),  // 7♣ (completes straight 6-7-8-9-10 with different card)
            make_card(7, 1),  // 9♦
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::Flush);
        assert_eq!(tiebreaker.values[0], 12); // Ace high flush
    }

    #[test]
    fn test_full_house_with_two_trips() {
        // When there are two three-of-a-kinds in 7 cards
        // Should pick the higher one as the trips
        let cards = [
            make_card(8, 0),  // 10♣
            make_card(8, 1),  // 10♦
            make_card(8, 2),  // 10♥
            make_card(5, 0),  // 7♣
            make_card(5, 1),  // 7♦
            make_card(5, 2),  // 7♥
            make_card(0, 3),  // 2♠
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::FullHouse);
        assert_eq!(tiebreaker.values[0], 8); // Three 10s (higher trips)
        assert_eq!(tiebreaker.values[1], 5); // Two 7s (pair from lower trips)
    }

    #[test]
    fn test_multiple_pairs_picks_highest() {
        // Three pairs in 7 cards - should pick the two highest
        let cards = [
            make_card(10, 0), // Q♣
            make_card(10, 1), // Q♦
            make_card(7, 2),  // 9♥
            make_card(7, 3),  // 9♠
            make_card(3, 0),  // 5♣
            make_card(3, 1),  // 5♦
            make_card(0, 2),  // 2♥
        ];
        let (rank, tiebreaker) = evaluate_hand(&cards);
        assert_eq!(rank, HandRank::TwoPair);
        assert_eq!(tiebreaker.values[0], 10); // Higher pair is queens
        assert_eq!(tiebreaker.values[1], 7);  // Lower pair is 9s
        assert_eq!(tiebreaker.values[2], 0);  // 2 kicker
    }

    // Tiebreaker tests
    #[test]
    fn test_pair_tiebreaker_by_kickers() {
        // Both have pair of 8s, but different kickers
        let hand1 = [
            make_card(6, 0),  // 8♣
            make_card(6, 1),  // 8♦
            make_card(12, 2), // A♥
            make_card(11, 3), // K♠
            make_card(10, 0), // Q♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let hand2 = [
            make_card(6, 2),  // 8♥
            make_card(6, 3),  // 8♠
            make_card(12, 0), // A♣
            make_card(11, 1), // K♦
            make_card(9, 2),  // J♥
            make_card(0, 3),  // 2♠
            make_card(1, 0),  // 3♣
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::Pair);
        assert_eq!(rank2, HandRank::Pair);
        assert_eq!(tb1.values[0], 6); // Both have pair of 8s
        assert_eq!(tb2.values[0], 6);
        assert_eq!(tb1.values[1], 12); // Both have A kicker
        assert_eq!(tb2.values[1], 12);
        assert_eq!(tb1.values[2], 11); // Both have K kicker
        assert_eq!(tb2.values[2], 11);
        // hand1 has Q (rank 10), hand2 has J (rank 9)
        assert!(tb1 > tb2); // hand1 wins with better third kicker
    }

    #[test]
    fn test_two_pair_tiebreaker_by_kicker() {
        // Both have A-A-K-K, different kickers
        let hand1 = [
            make_card(12, 0), // A♣
            make_card(12, 1), // A♦
            make_card(11, 2), // K♥
            make_card(11, 3), // K♠
            make_card(10, 0), // Q♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let hand2 = [
            make_card(12, 2), // A♥
            make_card(12, 3), // A♠
            make_card(11, 0), // K♣
            make_card(11, 1), // K♦
            make_card(9, 2),  // J♥
            make_card(0, 3),  // 2♠
            make_card(1, 0),  // 3♣
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::TwoPair);
        assert_eq!(rank2, HandRank::TwoPair);
        // hand1 has Q kicker, hand2 has J kicker
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_three_of_a_kind_tiebreaker() {
        // Both have three 7s, different kickers
        let hand1 = [
            make_card(5, 0),  // 7♣
            make_card(5, 1),  // 7♦
            make_card(5, 2),  // 7♥
            make_card(12, 3), // A♠
            make_card(11, 0), // K♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let hand2 = [
            make_card(5, 3),  // 7♠
            make_card(5, 0),  // 7♣
            make_card(5, 1),  // 7♦
            make_card(12, 0), // A♣
            make_card(10, 2), // Q♥
            make_card(0, 3),  // 2♠
            make_card(1, 0),  // 3♣
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::ThreeOfAKind);
        assert_eq!(rank2, HandRank::ThreeOfAKind);
        // Both have A as first kicker, hand1 has K, hand2 has Q
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_four_of_a_kind_tiebreaker() {
        // Both have four 9s, different kickers
        let hand1 = [
            make_card(7, 0),  // 9♣
            make_card(7, 1),  // 9♦
            make_card(7, 2),  // 9♥
            make_card(7, 3),  // 9♠
            make_card(12, 0), // A♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let hand2 = [
            make_card(7, 0),  // 9♣
            make_card(7, 1),  // 9♦
            make_card(7, 2),  // 9♥
            make_card(7, 3),  // 9♠
            make_card(11, 0), // K♣
            make_card(0, 3),  // 2♠
            make_card(1, 0),  // 3♣
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::FourOfAKind);
        assert_eq!(rank2, HandRank::FourOfAKind);
        // hand1 has A kicker, hand2 has K kicker
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_flush_tiebreaker() {
        // Both have flushes, different high cards
        let hand1 = [
            make_card(12, 2), // A♥
            make_card(10, 2), // Q♥
            make_card(8, 2),  // 10♥
            make_card(6, 2),  // 8♥
            make_card(4, 2),  // 6♥
            make_card(0, 0),  // 2♣
            make_card(1, 1),  // 3♦
        ];
        let hand2 = [
            make_card(12, 3), // A♠
            make_card(10, 3), // Q♠
            make_card(8, 3),  // 10♠
            make_card(6, 3),  // 8♠
            make_card(3, 3),  // 5♠
            make_card(0, 0),  // 2♣
            make_card(1, 1),  // 3♦
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::Flush);
        assert_eq!(rank2, HandRank::Flush);
        // Both have A-Q-10-8, but hand1 has 6 and hand2 has 5
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_high_card_tiebreaker() {
        // Both have ace high, different kickers
        let hand1 = [
            make_card(12, 0), // A♣
            make_card(11, 1), // K♦
            make_card(9, 2),  // J♥
            make_card(7, 3),  // 9♠
            make_card(5, 0),  // 7♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let hand2 = [
            make_card(12, 2), // A♥
            make_card(11, 3), // K♠
            make_card(9, 0),  // J♣
            make_card(7, 1),  // 9♦
            make_card(4, 2),  // 6♥
            make_card(0, 3),  // 2♠
            make_card(1, 0),  // 3♣
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::HighCard);
        assert_eq!(rank2, HandRank::HighCard);
        // Both have A-K-J-9, but hand1 has 7 and hand2 has 6
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_full_house_tiebreaker() {
        // Different trips
        let hand1 = [
            make_card(8, 0),  // 10♣
            make_card(8, 1),  // 10♦
            make_card(8, 2),  // 10♥
            make_card(5, 0),  // 7♣
            make_card(5, 1),  // 7♦
            make_card(0, 2),  // 2♥
            make_card(1, 3),  // 3♠
        ];
        let hand2 = [
            make_card(7, 0),  // 9♣
            make_card(7, 1),  // 9♦
            make_card(7, 2),  // 9♥
            make_card(5, 2),  // 7♥
            make_card(5, 3),  // 7♠
            make_card(0, 0),  // 2♣
            make_card(1, 1),  // 3♦
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::FullHouse);
        assert_eq!(rank2, HandRank::FullHouse);
        // hand1 has 10s full of 7s, hand2 has 9s full of 7s
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_full_house_tiebreaker_same_trips() {
        // Same trips, different pairs
        let hand1 = [
            make_card(8, 0),  // 10♣
            make_card(8, 1),  // 10♦
            make_card(8, 2),  // 10♥
            make_card(6, 0),  // 8♣
            make_card(6, 1),  // 8♦
            make_card(0, 2),  // 2♥
            make_card(1, 3),  // 3♠
        ];
        let hand2 = [
            make_card(8, 0),  // 10♣
            make_card(8, 1),  // 10♦
            make_card(8, 2),  // 10♥
            make_card(5, 0),  // 7♣
            make_card(5, 1),  // 7♦
            make_card(0, 0),  // 2♣
            make_card(1, 1),  // 3♦
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::FullHouse);
        assert_eq!(rank2, HandRank::FullHouse);
        // Both have 10s, but hand1 has 8s and hand2 has 7s
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_straight_tiebreaker() {
        // Both have straights, different high cards
        let hand1 = [
            make_card(8, 0),  // 10♣
            make_card(9, 1),  // J♦
            make_card(10, 2), // Q♥
            make_card(11, 3), // K♠
            make_card(12, 0), // A♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        let hand2 = [
            make_card(4, 0),  // 6♣
            make_card(5, 1),  // 7♦
            make_card(6, 2),  // 8♥
            make_card(7, 3),  // 9♠
            make_card(8, 0),  // 10♣
            make_card(0, 1),  // 2♦
            make_card(1, 2),  // 3♥
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::Straight);
        assert_eq!(rank2, HandRank::Straight);
        // hand1 has A-high straight, hand2 has 10-high straight
        assert!(tb1 > tb2);
    }

    #[test]
    fn test_straight_flush_tiebreaker() {
        // Both have straight flushes, different high cards
        let hand1 = [
            make_card(5, 2),  // 7♥
            make_card(6, 2),  // 8♥
            make_card(7, 2),  // 9♥
            make_card(8, 2),  // 10♥
            make_card(9, 2),  // J♥
            make_card(0, 0),  // 2♣
            make_card(1, 1),  // 3♦
        ];
        let hand2 = [
            make_card(3, 3),  // 5♠
            make_card(4, 3),  // 6♠
            make_card(5, 3),  // 7♠
            make_card(6, 3),  // 8♠
            make_card(7, 3),  // 9♠
            make_card(0, 0),  // 2♣
            make_card(1, 1),  // 3♦
        ];
        
        let (rank1, tb1) = evaluate_hand(&hand1);
        let (rank2, tb2) = evaluate_hand(&hand2);
        
        assert_eq!(rank1, HandRank::StraightFlush);
        assert_eq!(rank2, HandRank::StraightFlush);
        // hand1 has J-high straight flush, hand2 has 9-high straight flush
        assert!(tb1 > tb2);
    }
}
