# SparkLine

Learning Svelte and how compiling a web components by the Sparkline example.

![Image of SparkLine](https://raw.githubusercontent.com/creadone/sparkline/master/screenshot.png)

## Installation & Usage

```html
<html>
  <head>
    <script defer src='dist/index.js'></script>
  </head>
  <body>
    <chart-sparkline
      values = "685, 539, 182, 69, 313, 798, 749"
      line_color = "rgba(0, 141, 240, 0.5)"
      fill_color = "rgba(0, 203, 253, 0.5)"
    ></chart-sparkline>
  </body>
</html>
```