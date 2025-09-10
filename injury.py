import requests
import json
from bs4 import BeautifulSoup

def scrape_injured_players(urls):
    """
    Scrapes injured and suspended player data from a list of URLs.

    Args:
        urls (dict): A dictionary mapping league names to their respective URLs.

    Returns:
        dict: A dictionary containing the scraped data, structured by league.
    """
    # Dictionary to hold all the scraped data
    all_players_data = {}

    # Iterate through each league and its URL
    for league_name, url in urls.items():
        print(f"Scraping data for {league_name} from {url}...")
        
        # Initialize a list to hold players for the current league
        league_players = []

        try:
            # Send an HTTP GET request to the URL
            response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            # Raise an HTTPError if the response status code is 4XX or 5XX
            response.raise_for_status()

            # Parse the HTML content of the page
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find all team headings (h3 tags contain team names)
            team_headings = soup.find_all('h3')
            
            # Process each team and its associated injury rows
            for team_heading in team_headings:
                team_name = team_heading.get_text().strip()
                
                # Skip non-team headings
                exclude_words = ['injuries', 'suspensions', 'premier', 'liga', 'bundesliga', 'serie', 'ligue', 'la liga', 'serie a', 'news', 'updates']
                if any(word in team_name.lower() for word in exclude_words):
                    continue
                
                # Find all injury rows that follow this team heading (until the next team heading)
                current_element = team_heading.next_sibling
                team_injury_rows = []
                
                while current_element:
                    # If we encounter another h3 (team heading), stop
                    if current_element.name == 'h3':
                        break
                    
                    # If this is an injury row, add it to our list
                    if (hasattr(current_element, 'get') and 
                        current_element.get('class') and 
                        'inj-row' in current_element.get('class', [])):
                        team_injury_rows.append(current_element)
                    
                    current_element = current_element.next_sibling
                
                # Process all injury rows for this team
                for row in team_injury_rows:
                    # Get the first div which contains the raw data
                    data_div = row.find('div')
                    if not data_div:
                        continue
                    
                    # Extract text and split by newlines
                    row_text = data_div.get_text().strip()
                    lines = [line.strip() for line in row_text.split('\n') if line.strip()]
                    
                    if len(lines) < 4:
                        continue
                    
                    player_data = {}
                    player_data['team'] = team_name
                    player_data['player_name'] = lines[0] if lines[0] else "N/A"
                    player_data['position'] = lines[1] if len(lines) > 1 else "N/A"
                    
                    # The injury info and return date are typically in the later lines
                    # Structure: Name, Position, Matches, Goals, Assists, Injury, Return Date
                    if len(lines) >= 7:
                        player_data['info'] = lines[5] if lines[5] and lines[5] != '-' else "N/A"
                        player_data['expected_return'] = lines[6] if lines[6] and lines[6] != '-' else "N/A"
                    elif len(lines) >= 6:
                        player_data['info'] = lines[5] if lines[5] and lines[5] != '-' else "N/A"
                        player_data['expected_return'] = "N/A"
                    else:
                        player_data['info'] = "N/A"
                        player_data['expected_return'] = "N/A"
                    
                    # Only add if we have a valid player name
                    if player_data['player_name'] != "N/A" and player_data['player_name']:
                        league_players.append(player_data)

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {url}: {e}")
            league_players.append({"error": f"Failed to scrape data from {url}"})
        
        # Add the scraped data for the current league to the main dictionary
        all_players_data[league_name] = league_players

    return all_players_data

def save_to_json(data, filename='injured_players.json'):
    """
    Saves a dictionary of data to a JSON file.

    Args:
        data (dict): The data to be saved.
        filename (str): The name of the file to save to.
    """
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print(f"Successfully saved data to {filename}")
    except IOError as e:
        print(f"Error saving file: {e}")

if __name__ == '__main__':
    # List of URLs to scrape
    urls_to_scrape = {
        "england-premier-league": "https://www.sportsgambler.com/injuries/football/england-premier-league/",
        "spain-la-liga": "https://www.sportsgambler.com/injuries/football/spain-la-liga/",
        "italy-serie-a": "https://www.sportsgambler.com/injuries/football/italy-serie-a/",
        "germany-bundesliga": "https://www.sportsgambler.com/injuries/football/germany-bundesliga/",
        "france-ligue-1": "https://www.sportsgambler.com/injuries/football/france-ligue-1/",
        "uefa-europa-league": "https://www.sportsgambler.com/injuries/football/uefa-europa-league/",
        "uefa-champions-league": "https://www.sportsgambler.com/injuries/football/uefa-champions-league/"
        
    }

    # Scrape the data
    scraped_data = scrape_injured_players(urls_to_scrape)
    
    # Save the data to a JSON file
    save_to_json(scraped_data)
