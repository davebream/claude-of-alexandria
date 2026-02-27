// Echo provider for grader calibration tests.
// Returns the prompt as output so synthetic responses can be graded.
module.exports = async function (prompt) {
  return { output: prompt };
};
