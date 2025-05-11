from flask import Flask, render_template, jsonify
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.manifold import MDS

app = Flask(__name__)

# Load dataset
df = pd.read_csv('data/Music Popularity Dataset 1962-2018.csv')

# Precompute PCA (e.g. on the 14 numerical features)

num_cols = ['release_year', 'followers', 'artist_popularity', 'song_popularity', 'duration_sec', 'acousticness', 'danceability', 'energy', 'instrumentalness', 'liveness', 'loudness', 'speechiness', 'valence', 'tempo']
X = df[num_cols].values
X_scaled = StandardScaler().fit_transform(X)
pca = PCA(n_components=10).fit(X_scaled)
pca_explained = pca.explained_variance_ratio_.tolist()
# Precompute MDS on correlations
scaled_mds_df = pd.DataFrame(X_scaled, columns=df[num_cols].columns)
# Compute the absolute correlation matrix and then convert to distance
corr = scaled_mds_df.corr().abs()
distance_matrix = 1 - corr.values
# Compute MDS embedding using precomputed distance matrix
mds = MDS(n_components=2, dissimilarity='precomputed', random_state=42).fit_transform(distance_matrix)

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
