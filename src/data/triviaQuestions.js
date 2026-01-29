// Music Trivia Questions Database
// Each question has difficulty (easy=1pt, medium=2pts, hard=3pts), correct answer, and options
// Just a starting point to build off of, it will be build on top of. [VERSION .01}]
export const triviaQuestions = [
  // EASY (1 point)
  {
    difficulty: "easy",
    points: 1,
    question: "Who is known as the 'King of Rock and Roll'?",
    correctAnswer: "Elvis Presley",
    options: ["Elvis Presley", "Chuck Berry", "Little Richard", "Bill Haley"],
  },
  {
    difficulty: "easy",
    points: 1,
    question: "Which band released the album 'Abbey Road'?",
    correctAnswer: "The Beatles",
    options: ["The Beatles", "The Rolling Stones", "The Who", "Pink Floyd"],
  },
  {
    difficulty: "easy",
    points: 1,
    question: "What is the most streamed song on Spotify of all time?",
    correctAnswer: "Blinding Lights",
    options: ["Blinding Lights", "Shape of You", "Someone You Loved", "Levitating"],
  },
  {
    difficulty: "easy",
    points: 1,
    question: "Which artist released 'Thriller'?",
    correctAnswer: "Michael Jackson",
    options: ["Michael Jackson", "Prince", "David Bowie", "Queen"],
  },
  {
    difficulty: "easy",
    points: 1,
    question: "Who sang 'Bohemian Rhapsody'?",
    correctAnswer: "Queen",
    options: ["Queen", "Pink Floyd", "Led Zeppelin", "The Beatles"],
  },
  {
    difficulty: "easy",
    points: 1,
    question: "Which instrument has 88 keys?",
    correctAnswer: "Piano",
    options: ["Piano", "Guitar", "Violin", "Trumpet"],
  },
  {
    difficulty: "easy",
    points: 1,
    question: "How many strings does a standard guitar have?",
    correctAnswer: "6",
    options: ["6", "4", "8", "12"],
  },
  {
    difficulty: "easy",
    points: 1,
    question: "Who is known as the 'Queen of Pop'?",
    correctAnswer: "Madonna",
    options: ["Madonna", "Britney Spears", "Lady Gaga", "Beyoncé"],
  },

  // MEDIUM (2 points)
  {
    difficulty: "medium",
    points: 2,
    question: "What year did The Beatles break up?",
    correctAnswer: "1970",
    options: ["1970", "1969", "1968", "1971"],
  },
  {
    difficulty: "medium",
    points: 2,
    question: "Which album is Adele's best-selling album?",
    correctAnswer: "21",
    options: ["21", "25", "30", "19"],
  },
  {
    difficulty: "medium",
    points: 2,
    question: "Who produced most of The Weeknd's album 'After Hours'?",
    correctAnswer: "The Weeknd",
    options: ["The Weeknd", "Metro Boomin", "DJ Mustard", "Trance"],
  },
  {
    difficulty: "medium",
    points: 2,
    question: "In what year was the first Grammy Awards held?",
    correctAnswer: "1959",
    options: ["1959", "1965", "1970", "1955"],
  },
  {
    difficulty: "medium",
    points: 2,
    question: "Which music festival is the largest in the United States?",
    correctAnswer: "Burning Man",
    options: ["Burning Man", "Coachella", "Lollapalooza", "Ultra"],
  },
  {
    difficulty: "medium",
    points: 2,
    question: "What is the shortest concert ever recorded?",
    correctAnswer: "2 seconds",
    options: ["2 seconds", "5 seconds", "10 seconds", "15 seconds"],
  },
  {
    difficulty: "medium",
    points: 2,
    question: "Who is the best-selling female artist of all time?",
    correctAnswer: "Eminem",
    options: ["Eminem", "Madonna", "Mariah Carey", "Aretha Franklin"],
  },
  {
    difficulty: "medium",
    points: 2,
    question: "Which rapper has won the most Grammy Awards?",
    correctAnswer: "Jay-Z",
    options: ["Jay-Z", "Eminem", "Kanye West", "Drake"],
  },

  // HARD (3 points)
  {
    difficulty: "hard",
    points: 3,
    question: "What is the highest note a human voice can produce called?",
    correctAnswer: "Soprano",
    options: ["Soprano", "Falsetto", "Whistle register", "Shriek"],
  },
  {
    difficulty: "hard",
    points: 3,
    question: "Which composer is deaf but composed some of the world's greatest symphonies?",
    correctAnswer: "Ludwig van Beethoven",
    options: ["Ludwig van Beethoven", "Wolfgang Mozart", "Johann Bach", "Franz Schubert"],
  },
  {
    difficulty: "hard",
    points: 3,
    question: "What is the technical term for the distance between two musical notes?",
    correctAnswer: "Interval",
    options: ["Interval", "Octave", "Harmonic", "Resonance"],
  },
  {
    difficulty: "hard",
    points: 3,
    question: "How many strings did Prince play on his debut album?",
    correctAnswer: "All of them",
    options: ["All of them", "Only guitar", "Only drums", "Only bass"],
  },
  {
    difficulty: "hard",
    points: 3,
    question: "What is the oldest known musical instrument?",
    correctAnswer: "Flute",
    options: ["Flute", "Drum", "Lyre", "Harp"],
  },
  {
    difficulty: "hard",
    points: 3,
    question: "Who was the first artist to receive a Grammy lifetime achievement award?",
    correctAnswer: "Bing Crosby",
    options: ["Bing Crosby", "Frank Sinatra", "Duke Ellington", "Louis Armstrong"],
  },
  {
    difficulty: "hard",
    points: 3,
    question: "What is the rarest guitar in the world?",
    correctAnswer: "The Messiah Stradivarius",
    options: ["The Messiah Stradivarius", "The 1959 Les Paul", "The Blackie Stratocaster", "The Red Telecaster"],
  },
];

/**
 * Get a random question by difficulty level
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 * @returns {object} A trivia question object
 */
export function getRandomQuestion(difficulty = null) {
  let questions = triviaQuestions;

  if (difficulty) {
    questions = triviaQuestions.filter((q) => q.difficulty === difficulty);
  }

  if (questions.length === 0) {
    return null;
  }

  return questions[Math.floor(Math.random() * questions.length)];
}
