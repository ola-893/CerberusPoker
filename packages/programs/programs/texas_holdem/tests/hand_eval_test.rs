// Standalone test file for hand evaluator
// This bypasses the compilation issues in the main program

#[path = "../src/hand_eval.rs"]
mod hand_eval;

use hand_eval::*;

// Helper to create a card from rank and suit
fn make_card(rank: u8, suit: u8) -> u8 {
    suit * 13 + rank
}

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
