let score = 0;

function getScore() {
    return score;
}

function addScore(amount = 1) {
    score += amount;
}

module.exports = {
    getScore,
    addScore
};
