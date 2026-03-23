## Topics Content Generation

Act as an System Design Architect (Robotics/AI/Biotech) and Bio-informatic Scientist. Based on the following curriculum graph, generate the detailed theoretical content for ALL 15 topics. 

Here is the graph:
```
{{ curriculum_graph }}
```

For each of the 15 topics, create a JSON object. The content must be rigorous, highly accurate, and suitable for university students and professionals. The `theory` field must use standard Markdown formatting (headers `##`, `###`, bolding, and bullet points).

Output a single JSON array containing 15 objects following this exact schema:
```
[
  {
    "topicId": "MUST MATCH ID FROM GRAPH",
    "title": "MUST MATCH TITLE FROM GRAPH",
    "subjectId": "data-science-math",
    "coreConcept": "A dense, 2-3 sentence summary of the foundational concept.",
    "theory": "## Main Header\n\nDetailed markdown text explaining the theory, formulas, and real-world application.\n\n### Sub-concept\n- **Point 1**: Explanation\n- **Point 2**: Explanation",
    "keyTakeaways": [
      "Takeaway 1",
      "Takeaway 2",
      "Takeaway 3",
      "Takeaway 4"
    ]
  }
]
```

Provide ONLY the valid JSON array in code block.
