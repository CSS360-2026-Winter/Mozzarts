## **Cyclomatic Complexity Analysis (Arteen Ramezani):**

For this task, I analyzed the bot by measuring the cyclomatic complexity of its methods, with a primary focus on the trivia command where most of the core logic for our bot is. I reviewed the code to identify decision points such as conditional statements, loops, and error-handling paths that increase the number of possible execution flows within each method. This analysis showed that most helper functions fall within a low to moderate complexity range, which is good. But, two outliers are the main `execute(interaction)` handler and the `getRandomItunesTrack` method that have significantly higher complexity due to a lot of branching and control flow. Although the bot functions correctly, these areas represent higher risk for maintenance and testing because of the number of possible paths through the code.

### **Cyclomatic Complexity by Method**

- `execute(interaction)` → ~45 (**Very High**)  
- `getRandomItunesTrack` → ~20 (**High**)  
- `isCorrectGuess` → ~9 (**Moderate**)  
- `findTextChannel` → ~9 (**Moderate**)  
- `requestBuffer` → ~6 (**Low–Moderate**)  
- `cleanupSession` → ~5 (**Low**)  
- `ensureVoiceConnection` → ~5 (**Low**)  
- `normalizeString` → ~3 (**Low**)  
