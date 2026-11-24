export function scoreAnswers(ingredients, answersByIngredientId) {
  let total = 0;
  const breakdown = ingredients.map((ingredient) => {
    const choice = answersByIngredientId[String(ingredient.id)] ?? null;
    let points = 0;
    if (choice === 'IN') points = ingredient.is_present ? 1 : -1;
    if (choice === 'NOT_IN') points = ingredient.is_present ? -1 : 1;
    total += points;
    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      choice,
      isPresent: Boolean(ingredient.is_present),
      points,
    };
  });
  return { total, breakdown };
}
