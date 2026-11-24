
from app.services.gemini_service import generate_answer

question = "What is machine learning?"

context = """
Machine learning is a branch of artificial intelligence.
It allows computers to learn patterns from data
and make predictions without being explicitly programmed
for every individual task.
"""

try:
    answer = generate_answer(question, context)

    print("\nGemini API connection successful!")
    print("\nQuestion:", question)
    print("\nGemini Answer:")
    print(answer)

except Exception as error:
    print("\nGemini API test failed:")
    print(error)
