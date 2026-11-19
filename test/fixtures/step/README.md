`olifant/conjure` shown steps, hand-built (spec §0.B.10): durandal.nvim has no recorded step.
Each is `{ "shown": … }` as the server answers, with the fields of olifant's `stepJson`
(`src/Olifant/Server/ConjureStep.hs:415-443` at the pin) and the values of durandal.nvim's
`tests/step_spec.lua` `shown()` builder at `770834e`. `took` is a step the writer took,
`nostep` one it took none of (goal `nothing`), `failing` one whose tests went red, whose file
does not parse and which dropped a path. Do not edit them to suit a test: build variants in
code (`test/stepFixtures.ts`).
