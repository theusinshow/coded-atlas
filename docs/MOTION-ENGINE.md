# MOTION ENGINE — Coded Atlas

## Principle

Motion is an extension of Canvas, not a separate editor.

```text
CanvasDocument
↓ Animate
MotionDocument
↓
Scenes
↓
Motion Presets
↓
Render
```

## MotionDocument

Contains dimensions, FPS, Scenes, audio, style preset, duration and revision.

## Scene

Contains duration, Layers, AnimationTracks, transitions and background.

## Shared Layer model

Motion reuses the same Layers used by static creation. Animation references a layer; it does not create a parallel layer system.

## Initial animatable properties

x, y, scale, rotation, opacity and blur.

## V1 rule

Motion V1 is **scene-based and preset-driven**, not keyframe-first.

## Initial motion presets

Fade Up, Slide Left, Slide Right, Scale In, Smooth Zoom, Float, Parallax, Browser Reveal, Device Float, Stack Reveal, Website Scroll and UI Focus.

## Generated vs captured motion

Generated motion animates Atlas assets. Captured motion records real product behavior such as GSAP, hover, menu, carousel, custom cursor, page transition or WebGL.

Captured motion becomes an Asset reusable in other videos.

## VideoRecipe

Higher-level reusable video structure. Example: `Website Reveal Reel`.

A recipe may define intro, desktop, mobile, detail, scroll, outro, duration range and supported ratios.

## Atlas Brain boundary

Brain may choose VideoRecipe, Scene definitions, assets, compositions, motion presets and text. It must not manipulate frame-level coordinates.

## Rendering

Domain: `MotionDocument`.

Infrastructure: `MotionRenderer` adapter.

Initial implementation may use Remotion + FFmpeg, but domain types remain vendor-neutral.

## Preview

Browser preview is not final render. Support fast interactive preview, low-quality preview render where useful and final render.

## Formats

Initial focus: 9:16, 4:5, 1:1 and 16:9.

## Scope limit

Atlas creates showcase motion and short-form media. It is not a Premiere/After Effects replacement.
