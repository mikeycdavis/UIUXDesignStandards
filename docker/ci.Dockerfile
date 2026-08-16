# The CI environment — everything the checks need, and nothing from the developer's machine.
#
# The image is the isolation boundary. A check that passes here passes because the repository is
# correct, not because a particular laptop happens to have a tool installed, a database running, or a
# git identity configured. That is the whole reason CI moved into a container.
#
# WHAT IS IN HERE, AND WHY EACH THING IS.
#
#   node 20    The version .github/workflows/ci.yml pins. The package requires >=18; the hosted
#              workflow runs 20; local CI must not be the place where a Node-version difference is
#              discovered, so it runs 20 too.
#   git        NOT optional and NOT a convenience. Four scripts shell out to it —
#              content-identity.mjs resolves committed-tree identities, version-identity.mjs and
#              release-readiness.mjs resolve the release tag, chronology.mjs reads commit ordering —
#              and the test suite builds real throwaway repositories to exercise them. A container
#              without git does not fail these checks, it makes them report EVIDENCE_UNAVAILABLE,
#              which is the quiet non-answer this framework exists to refuse.
#
# There is DELIBERATELY NO DEPENDENCY INSTALL STEP. This repository has zero dependencies and no
# lockfile (ADR 0001), and `node:test` ships with Node. Its absence here is the same decision, and the
# same absence, as in the hosted workflow.

FROM node:20-bookworm-slim

# ca-certificates rides along with git because git is useless without it the moment anything reaches a
# remote. Nothing in CI does, today; a missing certificate store is a confusing failure to inherit
# later for no saving now.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# THE SOURCE IS COPIED, NOT MOUNTED.
#
# A bind mount would let CI write to the developer's working tree: the falsifier harness deliberately
# vandalises a copy of the repository, `npm run diagrams` can rewrite a diagram, and a failed run
# would leave that behind. Copying also means the container cannot be affected by an edit made while
# the run is in progress, which is what makes "this exact tree passed" a claim rather than a hope.
#
# `.git` is copied WITH it, and that is not incidental. Version identity is established by comparing
# the executing tree against the release tag it claims to be; a source tree without tags resolves
# UNVERIFIED forever, which is a permanently unanswered question rather than a guard.
COPY --chown=node:node . /work
WORKDIR /work

# Run as a non-privileged user. CI executes repository code, repository code is what is under review,
# and code under review runs with the least authority that still lets it be reviewed.
USER node

# git refuses to operate on a tree owned by someone else. `--chown` above already makes the ownership
# match, so this is belt and braces rather than the fix — but the failure it prevents is
# `detected dubious ownership`, which surfaces as an unrelated-looking identity failure several
# scripts deep, and is worth one line to never debug.
RUN git config --global --add safe.directory /work

# No CMD that runs checks. The runner passes each stage explicitly (see scripts/ci-pipeline.mjs), so
# the image cannot carry a second, stale copy of the pipeline definition.
CMD ["node", "--version"]
