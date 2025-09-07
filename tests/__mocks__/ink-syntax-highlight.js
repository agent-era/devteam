// Mock implementation of ink-syntax-highlight for testing
function SyntaxHighlight({ code, language, theme }) {
  // Return the code as-is in a mock Text element for testing
  return {
    type: 'Text',
    props: {
      children: code
    }
  };
}

module.exports = SyntaxHighlight;
module.exports.default = SyntaxHighlight;