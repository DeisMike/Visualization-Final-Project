from flask import Flask, render_template, jsonify
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.manifold import MDS

app = Flask(__name__)

# Load dataset
df = pd.read_csv('data/Music Popularity Dataset 1962-2018.csv')

# Precompute PCA (e.g. on the 14 numerical features)

num_cols = ['release_year', 'followers', 'artist_popularity', 'song_popularity', 'duration_sec', 'acousticness', 'danceability', 'energy', 'instrumentalness', 'liveness', 'loudness', 'speechiness', 'valence', 'tempo']
pca = PCA(n_components=10).fit(df[num_cols])
pca_explained = pca.explained_variance_ratio_.tolist()
# Project for scree
# Precompute MDS on correlations
corr = df[num_cols].corr()
mds = MDS(n_components=2, dissimilarity='precomputed').fit_transform(1 - corr.abs())

@app.route('/')
def index():
    return render_template('index_final.html')

@app.route('/api/data')
def api_data():
    # Also return PCA + MDS
    payload = {
        'songs': df.to_dict(orient='records'),
        'pca_explained': pca_explained,
        'mds_coords': mds.tolist()
    }
    return jsonify(payload)

if __name__ == '__main__':
    app.run(debug=True)  # Set debug=True for development purposes
