// Echo provider for grader calibration tests.
// Returns the prompt as output so synthetic responses can be graded.
// Promptfoo 0.120.x file:// providers must export a class with callApi().
class EchoProvider {
  constructor(options) {
    this.providerId = options?.id || 'echo';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    return { output: prompt };
  }
}

module.exports = EchoProvider;
