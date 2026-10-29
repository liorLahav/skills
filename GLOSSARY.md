# Human Review

Explaining an agent-written change so a human reviewer understands why each part exists and how it works, from high level to low level.

## Language

**Goal**:
The one outcome the whole change is for, taken from what the person asked.
_Avoid_: Story, summary, feature

**Step**:
One thing a reviewer could check by hand in the app, in the order it has to be built, like one PR in a stack.
_Avoid_: Behavior, piece, change unit, layer

**Flow**:
One entry point that delivers part of a step (a route, job, consumer, UI action, migration), shown as what happens from first event to last. The lowest level of the review.
_Avoid_: Walkthrough, path, pipeline

**Decision**:
A choice the agent made that the person did not ask for, including doing something its own way where the repo already has a way. Each has what it chose, the other option, and why.
_Avoid_: Pattern break, assumption, agent choice
