import { getConfig } from "../src/server/config"
import { createGuardrailClassifier } from "../src/server/guardrail"
import { guardrailExamples } from "../src/server/guardrail.examples"

const config = getConfig()
const classify = createGuardrailClassifier(config)
let correct = 0
let errors = 0
console.log(
  `Guardrail model: ${config.guardrailModel || config.openaiModel || "(not configured)"}`
)
for (const { name, expected, ...input } of guardrailExamples) {
  try {
    const actual = await classify(input, AbortSignal.timeout(15_000))
    if (actual === expected) correct++
    console.log(
      `${actual === expected ? "PASS" : "FAIL"} ${name}: expected ${expected ? "in" : "out"}, got ${actual ? "in" : "out"}`
    )
  } catch {
    errors++
    // Model errors can contain credentials or connection details.
    console.log(`ERROR ${name}: classification unavailable (would refuse)`)
  }
}
console.log(
  `${correct}/${guardrailExamples.length} classified correctly; ${errors} errors.`
)
if (correct !== guardrailExamples.length) process.exitCode = 1
