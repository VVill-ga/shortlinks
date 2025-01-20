# Shortlink Generation Algorithm

The shortlinks server code has a problem. The simple algorithm it uses for generating shortlink paths becomes theoretically slower with every addition, until at some point, it spins forever, never returning a code. I think the best way to explain is by showing the steps it takes:

1. Generate 3 random letters (A-Z).
2. Concatenate them, and see if that code is being used in the database.
3. If not, hooray! Return it. If it is already used, go back to step 1.

See the problem? When we get to fewer random codes available, the process will continue picking random unavailable codes for a long time before landing on a free one. And if there are none available, it gets stuck in a loop. Sure, this won't happen until 26^3 shortlinks are generated, but these cases need to be accounted for. 

## Initial Thoughts

I would prefer the algorithm to not be sequential. You shouldn't get a link `/DCB` and be able to change it to `/DCA` and get someone else's link (all the time). I know of some algorithms like UUID which provides an id that is almost guaranteed not to repeat, but those ids are long. Maybe there are some things to be learned from its implementation? 

## UUID

After reading the [Wikipedia Page](https://en.wikipedia.org/wiki/Universally_unique_identifier) and the [Spec RFC](https://www.rfc-editor.org/rfc/rfc4122), it seems like the verbosity of UUIDs is what makes the algorithm work. There are 8 "standardized" versions of UUIDs (the 8th being "custom"), and for the most part, the main ingredients are a timestamp, the computer MAC address, and random numbers. In fact, version 4 is defined as 6 version/variant bits, and 122 randomly generated bits. That doesn't seem like what I am looking for at all.

## A Simple Idea

Maybe incrementation is possible in a fashionable way. What if I pre-randomize a list of digits, then map generated codes to the new order? So, upon first running the server, it would randomize the order of the alphabet (HEOCAPMZD...) then use that as the new base system (ABC -> HEO). It would be a relatively small bit of storage, but still look neat.

The immediate problem with this, is that I'd like to be able to delete shortlinks and reuse those codes later. With simple incrementing, I can't throw a code back in the pile to be used.

## An Even Simpler Idea

Okay, what if I generate all 26^3 codes at the start instead, throw them in a file/database in a random order, and add and remove from it like a stack? Seems like that should work perfectly! As an added bonus, this gives you an exact count of remaining codes, so the user can be warned and asked to remove old links. 

It seems like there should be a smarter solution than storing 17.5k strings in a file though, maybe an algorithm that jumps around between the numbers 0 and 26^3 until all numbers are hit? At this point, I'm out of leads and ideas, so it's time to pull a '20s developer move and consult our lord and savior ChatGPT.

## Consulting Mr. Altman

> Yes, there are mathematical algorithms that allow you to "jump" randomly around a range of numbers without repeating, and they don’t involve simply incrementing through the range. These are often based on pseudo-random number generators (PRNGs) or specific shuffling algorithms. Here are some techniques:
> 1. Fisher-Yates Shuffle (Knuth Shuffle)
> 2. Linear Congruential Generator (LCG) with Modulo
> 3. Permutation Polynomials
> 4. De Bruijn Sequence
> 5. Random Sampling without Replacement

Huh, the fifth suggestion is what we already have implemented. And as I read about these pseudo-random number generators, I'm realizing they *are* just specific shuffling algorithms. And this concept will have the same problem as my "simple idea" from before - there would be no way to put codes back in queue.

## Fisher-Yates Shuffle

When I initially proposed the 'Even Simpler Idea', I just said "throw them in a file/database in a random order". It turns out, this method has a name - the Fisher-Yates Shuffle (or Knuth Shuffle). This algorithm chooses random values one-by-one to build a new order of values. While the idea of storing a file full of unused codes originally seemed inefficient to me, I now realize that the features it offers makes the technique well worth it. This is what I am implementing for Shortlinks.