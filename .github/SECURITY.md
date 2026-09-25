# Security policy

## Reporting a vulnerability

Please report a vulnerability privately, not in a public issue.

Use GitHub's private reporting: the **Report a vulnerability** button on this
repository's [Security tab](https://github.com/navecss/navecss/security). It
opens a private advisory that only you and the maintainer can see.

If that button is not there, open an ordinary issue titled "Security contact
request" that says only that you have a report to send, and leave out every
detail of the problem. The reply gives you a private way to send it.

Send the report, not a patch. If you want to offer a fix, say so in the report:
it can then come in as a pull request on the advisory's temporary private fork,
under the terms in
[Licensing your contribution](CONTRIBUTING.md#licensing-your-contribution).

## What to expect

Nave has one maintainer, so the aim is to acknowledge a report within 14 days.
After that you hear whether it is accepted as a vulnerability. If it is, the fix
and the advisory are worked on with you in the private report, and you are
credited in the published advisory unless you ask not to be. Please keep the
problem private until that advisory is published. If it is not accepted, the
private report is closed and the problem can go to a public issue like any other
bug.

## Supported versions

Security fixes are released for the latest version of `@navecss/core` and
`@navecss/tokens`. Before 1.0 they are not backported to an earlier minor
version.

## What this covers

The packages published from this repository, and the repository itself, its
workflows and release process included. Bugs that are not vulnerabilities,
questions, and anything about licensing or the Nave name go to a
[public issue](https://github.com/navecss/navecss/issues).
